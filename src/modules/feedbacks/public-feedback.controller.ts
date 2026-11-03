import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { FeedbacksService } from './feedbacks.service';
import { verifyPublicFeedbackPayload } from './public-feedback-link';
import { ArchiveService } from '../archive/archive.service';
import { audioMime } from '../archive/audio-policy';
import { sendPublicAudio } from '../archive/public-audio-response';
import { getJwtSecret } from 'src/common/utils/jwt-secret.util';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const categoryNames: Record<string, string> = {
  doctors: 'Врачи',
  nurses: 'Медсестры',
  cleanliness: 'Чистота',
  food: 'Питание',
  reception: 'Ресепшн',
  clinic: 'Клиника',
  overall: 'Общее впечатление',
};

@Controller('public/feedback')
export class PublicFeedbackController {
  constructor(
    private readonly feedbacks: FeedbacksService,
    private readonly config: ConfigService,
    private readonly archive: ArchiveService,
  ) {}

  @Get(':token')
  async open(@Param('token') token: string, @Res() res: Response) {
    const target = verifyPublicFeedbackPayload(getJwtSecret(this.config), token);
    if (!target) throw new ForbiddenException('Ссылка недоступна');
    const feedback = target.source === 'v21'
      ? await this.feedbacks.getPublicFeedbackCard(target.id)
      : await this.archive.feedbackCard(target.source as 'v1' | 'v2', target.id);
    const request = feedback.request;
    const patient = request.patient;
    const ratings = Object.entries(feedback.ratings || {})
      .map(
        ([key, value]) =>
          `<li><span>${escapeHtml(categoryNames[key] || key)}</span><strong>${escapeHtml(value)}/5</strong></li>`,
      )
      .join('');
    const evidence = (feedback.evidenceMessages || [])
      .map((item, index) => {
        if (item.type === 'audio') return `<li>Голосовое сообщение ${index + 1}<br><audio controls controlslist="nodownload" preload="none" src="${escapeHtml(token)}/audio/${escapeHtml(item.id)}"></audio></li>`;
        const label =
          item.type === 'audio'
            ? 'Голосовое сообщение — ссылка на прослушивание есть в Trello'
            : item.text || item.type;
        return `<li>${index + 1}. ${escapeHtml(label)}</li>`;
      })
      .join('');
    const createdAt = new Date(feedback.createdAt).toLocaleString('ru-RU', {
      timeZone: 'Asia/Tashkent',
    });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    });
    res.send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orzu Medical — обращение</title><style>
      audio{width:100%;max-width:600px;margin:12px 0}
      *{box-sizing:border-box}body{margin:0;background:#f5f7f6;color:#17211d;font:16px/1.5 Arial,sans-serif}.wrap{max-width:840px;margin:0 auto;padding:24px}.head{display:flex;align-items:center;gap:14px;margin-bottom:20px}.logo{width:56px;height:56px;border-radius:50%;background:#168c36;color:white;display:grid;place-items:center;font-weight:800}.card{background:white;border:1px solid #dfe7e2;border-radius:18px;padding:24px;box-shadow:0 10px 30px #173b2820}.badge{display:inline-block;padding:5px 10px;border-radius:999px;background:${feedback.type === 'complaint' ? '#ffe5e5;color:#c92a2a' : '#dff8ec;color:#087f5b'};font-weight:700}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px 18px;margin:22px 0}.k{color:#738078}.v{font-weight:600;overflow-wrap:anywhere}h1{font-size:26px;margin:0}h2{font-size:18px;margin:24px 0 10px}ul{padding-left:22px}.ratings{list-style:none;padding:0}.ratings li{display:flex;justify-content:space-between;border-bottom:1px solid #edf1ef;padding:8px 0}.note{white-space:pre-wrap;background:#f7f9f8;border-radius:12px;padding:14px}@media(max-width:600px){.wrap{padding:12px}.card{padding:18px}.grid{grid-template-columns:1fr;gap:3px}.k{margin-top:8px}}
    </style></head><body><main class="wrap"><div class="head"><div class="logo">ORZU</div><div><h1>Orzu Medical</h1><div>Карточка обращения</div></div></div><section class="card"><span class="badge">${feedback.type === 'complaint' ? 'Жалоба' : 'Предложение'}</span><div class="grid">
      <div class="k">Пациент</div><div class="v">${escapeHtml(patient.name)}</div>
      <div class="k">Телефон</div><div class="v">${escapeHtml(patient.phone)}</div>
      <div class="k">Филиал</div><div class="v">${escapeHtml(request.branch)}</div>
      <div class="k">Категория</div><div class="v">${escapeHtml(categoryNames[feedback.category] || feedback.category)}</div>
      <div class="k">Подкатегория</div><div class="v">${escapeHtml(feedback.subcategory)}</div>
      <div class="k">Повторность</div><div class="v">${feedback.occurrenceNumber > 1 ? `Повторная, №${feedback.occurrenceNumber}` : 'Первичная'}</div>
      <div class="k">Дата</div><div class="v">${escapeHtml(createdAt)}</div>
    </div><h2>Комментарий</h2><div class="note">${escapeHtml(feedback.comment || 'Комментарий не указан')}</div>${ratings ? `<h2>Оценки</h2><ul class="ratings">${ratings}</ul>` : ''}${evidence ? `<h2>Вложения</h2><ul>${evidence}</ul>` : ''}</section></main></body></html>`);
  }

  @Get(':token/audio/:id')
  async audio(@Param('token') token: string, @Param('id') id: string, @Req() req, @Res() res: Response) {
    const target = verifyPublicFeedbackPayload(getJwtSecret(this.config), token);
    if (!target) throw new ForbiddenException('Ссылка недоступна');
    const record = await this.archive.evidence(target.source, target.id, id, true);
    return sendPublicAudio(res, { data: record.data, mimeType: audioMime(record) }, req.headers.range);
  }
}
