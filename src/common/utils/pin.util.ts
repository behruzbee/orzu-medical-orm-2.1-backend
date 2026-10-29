import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme === 'scrypt') {
    if (
      !saltHex ||
      !hashHex ||
      !/^[0-9a-f]{32}$/i.test(saltHex) ||
      !/^[0-9a-f]{64}$/i.test(hashHex)
    ) {
      return false;
    }
    const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
    return timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
  }

  const actual = Buffer.from(pin);
  const expected = Buffer.from(stored);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
