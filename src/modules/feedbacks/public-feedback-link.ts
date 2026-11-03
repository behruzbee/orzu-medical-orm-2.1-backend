import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';

type PublicFeedbackPayload = { id: string; exp: number; source?: 'v1' | 'v2' | 'v21' };

function signature(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createPublicFeedbackToken(
  secret: string,
  feedbackId: string,
  ttlDays = 30,
  source: 'v1' | 'v2' | 'v21' = 'v21',
) {
  const validTtlDays =
    Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= 365 ? ttlDays : 30;
  const payload = Buffer.from(
    JSON.stringify({
      id: feedbackId,
      source,
      exp: Math.floor(Date.now() / 1000) + validTtlDays * 86_400,
    } satisfies PublicFeedbackPayload),
  ).toString('base64url');
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyPublicFeedbackToken(secret: string, token: string) {
  return verifyPublicFeedbackPayload(secret, token)?.id || null;
}

export function verifyPublicFeedbackPayload(secret: string, token: string) {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(secret, payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as PublicFeedbackPayload;
    if (!isUUID(value.id) || !Number.isSafeInteger(value.exp) || value.exp <= Math.floor(Date.now() / 1000) || !['v1', 'v2', 'v21'].includes(value.source || 'v21')) {
      return null;
    }
    return { ...value, source: value.source || 'v21' };
  } catch {
    return null;
  }
}

export function publicFeedbackUrl(
  backendUrl: string,
  secret: string,
  feedbackId: string,
  ttlDays = 30,
) {
  const origin = new URL(backendUrl).origin;
  const token = createPublicFeedbackToken(secret, feedbackId, ttlDays);
  return `${origin}/api/public/feedback/${token}`;
}
