import { Response } from 'express';
import { audioHeaders } from './audio-policy';

export function sendPublicAudio(
  res: Response,
  record: { data: Buffer; mimeType: string },
  range?: string,
) {
  const size = record.data.length;
  res.set({
    ...audioHeaders,
    'Content-Type': record.mimeType,
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
    'Content-Security-Policy': "default-src 'none'; media-src 'self'; frame-ancestors 'none'",
  });
  if (!range) return res.set('Content-Length', String(size)).send(record.data);
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    return res.status(416).set('Content-Range', `bytes */${size}`).end();
  }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return res.status(416).set('Content-Range', `bytes */${size}`).end();
  }
  return res.status(206).set({
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1),
  }).send(record.data.subarray(start, end + 1));
}
