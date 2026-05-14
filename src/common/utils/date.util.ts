export function isPossibleDate(value: any): boolean {
  if (!value) return false;
  if (typeof value === 'number' && value > 30000 && value < 60000) return true;
  const str = String(value).trim();
  return /^(\d{1,4}[./\-]\d{1,2}[./\-]\d{1,4})$/.test(str) || /^(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})$/.test(str);
}

export function parseExcelDate(excelDate: any): Date | null {
  if (!excelDate) return null;

  // 1. Если библиотека xlsx уже сама распознала дату (благодаря cellDates: true)
  if (excelDate instanceof Date) {
    if (!isNaN(excelDate.getTime())) {
      return excelDate;
    }
  }

  // 2. Если Excel передал дату как число (Excel Serial Date - количество дней с 1900 года)
  if (typeof excelDate === 'number') {
    // Формула конвертации Excel Serial Date в JS Date
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }

  // 3. Если дата пришла как строка
  if (typeof excelDate === 'string') {
    const str = excelDate.trim();

    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;

        const parsedDate = new Date(year, month - 1, day);
        if (!isNaN(parsedDate.getTime())) return parsedDate;
      }
    }

    if (str.includes('.')) {
      const parts = str.split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        if (year < 100) year += 2000;

        const parsedDate = new Date(year, month - 1, day);
        if (!isNaN(parsedDate.getTime())) return parsedDate;
      }
    }

    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  return null;
}