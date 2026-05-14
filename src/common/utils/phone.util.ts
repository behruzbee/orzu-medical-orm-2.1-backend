export function normalizePhone(phone: string): {
  valid: boolean;
  value: string;
} {
  // 1. Очищаем от плюсов, пробелов, скобок и тире
  let value = phone.replace(/\D/g, '');
  if (!value) return { valid: false, value: phone };

  if (value.length === 9) {
    value = '998' + value;
  }

  if (value.length === 11 && value.startsWith('8')) {
    value = '7' + value.slice(1);
  }

  if (value.length === 10 && !value.startsWith('7')) {
    value = '7' + value;
  }

  if (value.length < 10 || value.length > 15) {
    return { valid: false, value: phone };
  }

  return { valid: true, value: '+' + value };
}
