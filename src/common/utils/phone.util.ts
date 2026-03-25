export function normalizePhone(phone: string): { valid: boolean; value: string } {
  let value = phone.replace(/\D/g, ''); 
  if (!value) return { valid: false, value: phone };

  // Если узбекский номер введен без кода (9 цифр, напр. 901234567)
  if (value.length === 9) value = '998' + value;

  // Если казахский/российский номер введен без +7 или 8 (10 цифр, напр. 7051732801)
  if (value.length === 10) value = '7' + value;

  // Если номер начинается с 8 (напр. 87051732801)
  if (value.length === 11 && value.startsWith('8')) value = '7' + value.slice(1);

  const validPrefixes = ['998', '7', '375', '996', '992', '993', '994'];
  const prefix = validPrefixes.find((p) => value.startsWith(p));

  // Проверяем, найден ли префикс и достаточна ли длина номера (минимум 11 для +7 и 12 для +998)
  if (!prefix || value.length < 11) return { valid: false, value: phone };
  
  return { valid: true, value: '+' + value };
}