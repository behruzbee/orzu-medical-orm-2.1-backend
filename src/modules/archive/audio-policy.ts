import { UnsupportedMediaTypeException } from '@nestjs/common';

const audioTypes = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
]);

export function isAudio(record: {
  mimeType?: string;
  evidenceType?: string;
  type?: string;
}) {
  return (
    record.evidenceType === 'audio' ||
    record.type === 'audio' ||
    String(record.mimeType || '')
      .toLowerCase()
      .startsWith('audio/')
  );
}

export function audioMime(record: { mimeType?: string; bytes?: number }) {
  const mime = String(record.mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!audioTypes.has(mime) || !record.bytes || record.bytes > 64 * 1024 * 1024)
    throw new UnsupportedMediaTypeException(
      'Audio is unavailable for playback',
    );
  return mime === 'audio/x-m4a'
    ? 'audio/mp4'
    : mime === 'audio/x-wav'
      ? 'audio/wav'
      : mime;
}

export const audioHeaders = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Accept-Ranges': 'none',
};
