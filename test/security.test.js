require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GUARDS_METADATA,
  MODULE_METADATA,
} = require('@nestjs/common/constants');
const { AdminGuard } = require('../src/common/guards/admin.guard');
const { hashPin, verifyPin } = require('../src/common/utils/pin.util');
const {
  PinAuthStrategy,
} = require('../src/modules/auth/strategies/pin-auth.strategy');
const { JwtStrategy } = require('../src/modules/auth/strategies/jwt.strategy');
const { AuthService } = require('../src/modules/auth/auth.service');
const {
  ReportsController,
} = require('../src/modules/reports/reports.controller');
const {
  FeedbacksController,
} = require('../src/modules/feedbacks/feedbacks.controller');
const { ReportsService } = require('../src/modules/reports/reports.service');
const {
  REPORT_RATING_CATEGORIES,
  REPORT_SCORE_VALUES,
} = require('../src/common/report-stats/report-stats.service');
const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppModule } = require('../src/app.module');
const { TrelloModule } = require('../src/modules/trello/trello.module');
const { PatientsModule } = require('../src/modules/patients/patients.module');
const {
  IntegrationController,
} = require('../src/modules/patients/integration.controller');
const {
  patientRequestUrl,
  trelloEvidenceText,
} = require('../src/modules/feedbacks/trello-links');

test('Trello links open authenticated requests instead of direct evidence files', () => {
  const evidenceId = 'b8d71a7e-0e41-4dd8-aed3-c4761b70b4d8';
  assert.equal(
    trelloEvidenceText({
      mediaUrl: `https://old.example/api/feedbacks/evidence/${evidenceId}/file`,
    }),
    'Вложение доступно в обращении',
  );
  assert.equal(
    trelloEvidenceText({ text: 'Сообщение пациента' }),
    'Сообщение пациента',
  );
  assert.equal(
    patientRequestUrl('https://crm.example/', 'request-1'),
    'https://crm.example/patients/request-1',
  );
});

test('only Trello remains connected while BI API stays available', () => {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
  assert.ok(imports.includes(TrelloModule));
  assert.ok(imports.includes(PatientsModule));
  assert.equal(
    imports.some((module) => /Whatsapp|Telegram/.test(module.name)),
    false,
  );
  const trelloImports =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, TrelloModule) || [];
  assert.equal(
    trelloImports.some((module) => /Whatsapp|Telegram/.test(module.name)),
    false,
  );
  const patientControllers = Reflect.getMetadata(
    MODULE_METADATA.CONTROLLERS,
    PatientsModule,
  );
  assert.ok(patientControllers.includes(IntegrationController));
});

test('bulk reports require JWT and administrator role', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, ReportsController);
  assert.equal(guards.length, 2);
  assert.ok(guards.some((guard) => guard === AdminGuard));
  const adminGuard = new AdminGuard();
  const context = (role) => ({
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });
  assert.equal(adminGuard.canActivate(context('admin')), true);
  assert.throws(() => adminGuard.canActivate(context('operator')));
});

test('evidence files require JWT', () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, FeedbacksController);
  assert.ok(guards?.length);
});

test('PINs are hashed and login attempts are limited', async () => {
  const stored = hashPin('54321');
  assert.notEqual(stored, '54321');
  assert.equal(verifyPin('54321', stored), true);
  assert.equal(verifyPin('12345', stored), false);

  const strategy = new PinAuthStrategy({ findForLogin: async () => null });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(
      strategy.validate({
        method: 'pin',
        phone: '+998901234567',
        pin: '00000',
      }),
      (error) => error.status === 401,
    );
  }
  await assert.rejects(
    strategy.validate({ method: 'pin', phone: '+998901234567', pin: '00000' }),
    (error) => error.status === 429,
  );
});

test('JWT role comes from active database user and rotated tokens are rejected', async () => {
  const strategy = new JwtStrategy(
    { get: () => 'test-private-secret' },
    {
      findActiveById: async () => ({
        id: 'user-1',
        phone: '+998901234567',
        role: 'operator',
        tokenVersion: 2,
      }),
    },
  );
  const user = await strategy.validate({
    sub: 'user-1',
    role: 'admin',
    tokenVersion: 2,
  });
  assert.equal(user.role, 'operator');
  await assert.rejects(strategy.validate({ sub: 'user-1', tokenVersion: 1 }));
});

test('QR login no longer issues a token', async () => {
  const service = new AuthService({ sign: () => 'token' }, null);
  await assert.rejects(
    service.login({ method: 'qr' }),
    (error) => error.status === 400,
  );
});

test('report listings hide old public URLs and reject unsafe filenames', async () => {
  const repository = {
    find: async () => [
      {
        id: 'report-1',
        fileUrl: 'https://example.com/uploads/reports/report.xlsx',
      },
    ],
    findOne: async () => ({ id: 'report-1', name: '../secret.xlsx' }),
  };
  const service = new ReportsService(repository, null);
  const list = await service.findAll();
  assert.equal(list[0].fileUrl, '/api/reports/report-1/download');
  assert.equal(list[0].status, 'missing');
  assert.equal(list[0].fileAvailable, false);
  await assert.rejects(
    service.openReport('report-1'),
    (error) => error.status === 404,
  );
});

test('default generated report contains aggregate data only', async () => {
  const count = { count: 0, ratio: 0 };
  const ratings = Object.fromEntries(
    [...REPORT_RATING_CATEGORIES.map((category) => category.id), 'total'].map(
      (id) => [
        id,
        Object.fromEntries(REPORT_SCORE_VALUES.map((score) => [score, count])),
      ],
    ),
  );
  const totals = {
    handedOver: count,
    incorrect: {
      wrongNumber: count,
      employeeNumber: count,
      hasNotWhatsapp: count,
      total: count,
    },
    correct: {
      called: count,
      duplicates: count,
      noAnswer: count,
      unreachable: count,
      total: count,
    },
    ratings,
    feedback: {
      complaints: count,
      suggestions: count,
      notRelatedComplaints: count,
    },
  };
  let loadOptions;
  const stats = {
    loadReportData: async (_dto, options) => {
      loadOptions = options;
      return {
        start: new Date('2026-10-01'),
        end: new Date('2026-10-02'),
        requests: [
          { patient: { name: 'PRIVATE_PATIENT_NAME', phone: 'PRIVATE_PHONE' } },
        ],
        errorsLog: [],
        branchList: [],
        branches: [],
        totals,
      };
    },
  };
  const repository = { create: (value) => value, save: async (value) => value };
  const service = new ReportsService(repository, stats);
  const report = await service.generateReport({
    startDate: '2026-10-01',
    endDate: '2026-10-02',
  });
  const filePath = path.join(process.cwd(), 'uploads', 'reports', report.name);
  try {
    assert.equal(loadOptions.includeReportRelations, false);
    assert.match(report.fileUrl, /^\/api\/reports\/.+\/download$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    assert.equal(workbook.worksheets.length, 1);
    assert.equal(workbook.worksheets[0].getCell('BZ5').value, null);
    const buffer = await fs.readFile(filePath);
    assert.equal(buffer.includes(Buffer.from('PRIVATE_PATIENT_NAME')), false);
    assert.equal(buffer.includes(Buffer.from('PRIVATE_PHONE')), false);
    const recreated = await service.generateReport(
      { startDate: '2026-10-01', endDate: '2026-10-02' },
      {
        id: 'source-report',
        name: 'original.xlsx',
        createdAt: new Date('2026-10-03'),
      },
    );
    const recreatedPath = path.join(
      process.cwd(),
      'uploads',
      'reports',
      recreated.name,
    );
    try {
      assert.equal(recreated.status, 'recreated');
      assert.match(recreated.name, /^Recreated_source-report_/);
      const recreatedBook = new ExcelJS.Workbook();
      await recreatedBook.xlsx.readFile(recreatedPath);
      assert.equal(recreatedBook.worksheets.length, 2);
      assert.match(
        recreatedBook.getWorksheet('Пересоздание').getCell('B1').text,
        /Не является оригинальным/,
      );
      assert.equal(
        recreatedBook.getWorksheet('Пересоздание').getCell('B2').text,
        'source-report',
      );
      assert.ok(await fs.stat(filePath));
    } finally {
      await fs.rm(recreatedPath, { force: true });
    }
  } finally {
    await fs.rm(filePath, { force: true });
  }
});

test('report regeneration retains dates, excludes personal data and coalesces concurrent requests', async () => {
  const original = {
    id: 'source',
    name: 'original.xlsx',
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-09-30T23:59:59.999Z'),
  };
  const service = new ReportsService(
    { findOne: async ({ where }) => (where.id ? original : null) },
    null,
  );
  service.findAll = async () => [{ ...original, fileAvailable: false }];
  let calls = 0;
  service.generateReport = async (dto, source) => {
    calls++;
    assert.deepEqual(dto, {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      includePersonalData: false,
    });
    assert.equal(source, original);
    return { id: 'new-report' };
  };
  const result = await Promise.all([
    service.regenerateReport('source'),
    service.regenerateReport('source'),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ id: 'new-report' }, { id: 'new-report' }]);
  service.findAll = async () => [{ ...original, fileAvailable: true }];
  await assert.rejects(
    service.regenerateReport('source'),
    (error) => error.status === 409,
  );
});

test('regeneration reuses an available replacement without changing the original', async () => {
  const original = { id: 'source', name: 'original.xlsx' };
  const replacement = {
    id: 'replacement',
    name: 'Recreated_source_1.xlsx',
    status: 'recreated',
  };
  const service = new ReportsService(
    { findOne: async ({ where }) => (where.id ? original : replacement) },
    null,
  );
  service.findAll = async () => [
    { ...original, fileAvailable: false },
    { ...replacement, fileAvailable: true },
  ];
  assert.equal(await service.regenerateReport('source'), replacement);
});
