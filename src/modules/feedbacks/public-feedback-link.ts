import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';

type PublicFeedbackPayload = { id: string; exp: number };

function signature(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createPublicFeedbackToken(
  secret: string,
  feedbackId: string,
  ttlDays = 30,
) {
  const validTtlDays =
    Number.isInteger(ttlDays) && ttlDays >= 1 && ttlDays <= 365 ? ttlDays : 30;
  const payload = Buffer.from(
    JSON.stringify({
      id: feedbackId,
      exp: Math.floor(Date.now() / 1000) + validTtlDays * 86_400,
    } satisfies PublicFeedbackPayload),
  ).toString('base64url');
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyPublicFeedbackToken(secret: string, token: string) {
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
    if (!isUUID(value.id) || value.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return value.id;
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
