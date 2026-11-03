require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { ReportStatsService } = require('../src/common/report-stats/report-stats.service');
const { ReportsService } = require('../src/modules/reports/reports.service');
const { formatBranchName } = require('../src/common/utils/branch.util');

test('branch labels returned by BI remain valid filters when normalized again', () => {
  for (const branch of [
    'ОРЗУМЕД ФОТИМА СУЛТОН', 'ОРЗУМЕД ПАРКЕНТ', 'ОРЗУМЕД ОККУРГОН',
    'ОРЗУМЕД ЯнгиБОЗОР', 'Зангиота филиал', 'Юнусобод филиал',
    'Orzu filial', 'Orzu filiali', 'Орзу филиали',
  ]) {
    const label = formatBranchName(branch);
    assert.equal(formatBranchName(label), label);
  }
  assert.equal(formatBranchName('Орзу филиал филиал'), 'Орзу филиал');
});

test('report preview and Excel retain arrival-date/status rules across months and branches', async () => {
  const branch = 'ОРЗУМЕД ФОТИМА СУЛТОН';
  const request = (status, arrival, created, extra = {}) => ({
    branch, status, arrivalDate: new Date(arrival),
    feedback: { type: 'complaint', createdAt: new Date(created), ratings: {} },
    ...extra,
  });
  const rows = [
    request('feedback_neg', '2026-09-01', '2026-10-02'),
    request('feedback_neg', '2026-09-30T23:59:59.999', '2026-10-03'),
    request('feedback_not_related', '2026-09-12', '2026-09-12'),
    request('feedback_pos', '2026-09-10', '2026-10-02'),
    request('all_ok', '2026-09-09', '2026-09-09'),
    request('new', '2026-09-10', '2026-09-10'),
    request('contacted', '2026-09-10', '2026-09-10'),
    request('feedback_neg', '2026-08-31', '2026-09-12'),
    request('feedback_neg', '2026-10-01', '2026-10-02'),
    request('feedback_neg', '2026-09-10', '2026-10-02', { branch: 'ОРЗУМЕД ПАРКЕНТ' }),
  ];
  const stats = new ReportStatsService({
    find: async ({ where }) => {
      assert.equal(where.arrivalDate.type, 'between');
      assert.equal(where.status.type, 'not');
      assert.deepEqual(where.status.value, ['new', 'contacted']);
      const [start, end] = where.arrivalDate.value;
      return rows.filter(r => r.arrivalDate >= start && r.arrivalDate <= end &&
        !where.status.value.includes(r.status));
    },
  }, {
    find: async () => [{ branch, category: 'DUPLICATE_FILE', arrivalDate: new Date('2026-09-03') }],
  });
  const service = new ReportsService({ create: v => v, save: async v => v }, stats);
  const query = { startDate: '2026-09-01', endDate: '2026-09-30', branch: 'Орзумед Фотима Султон филиал' };
  const summary = await service.getSummary(query);
  assert.equal(summary.requests, 5);
  assert.equal(summary.handedOver, 6); // Five completed requests + one import error.
  assert.equal(summary.complaints, 2); // Includes October feedback for September arrivals.
  assert.equal(summary.suggestions, 1);
  assert.equal(summary.notRelated, 1); // Not also included as a complaint.
  const report = await service.generateReport(query);
  const filename = path.join(process.cwd(), 'uploads', 'reports', report.name);
  try {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(filename);
    const sheet = book.getWorksheet('Асосий хисобот (Отчет)');
    // Original template positions: branch row 5, total row 6.
    for (const row of [5, 6]) {
      assert.equal(sheet.getCell(row, 4).value, summary.handedOver);
      assert.equal(sheet.getCell(row, 74).value, summary.complaints);
      assert.equal(sheet.getCell(row, 76).value, summary.suggestions);
      assert.equal(sheet.getCell(row, 77).value, summary.notRelated);
    }
    assert.equal(sheet.columnCount, 78);
    assert.equal(book.worksheets.length, 1);
  } finally {
    await fs.rm(filename, { force: true });
  }
  const empty = await service.getSummary({ ...query, branch: 'Нет филиала' });
  assert.equal(empty.complaints, 0);
  assert.equal(empty.requests, 0);
  assert.equal(empty.handedOver, 0);
  await assert.rejects(service.getSummary({ ...query, endDate: '2026-08-01' }), /endDate/);
});
