export function isPossibleDate(value: any): boolean {
  if (!value) return false;
  if (typeof value === 'number' && value > 30000 && value < 60000) return true;
  const str = String(value).trim();
  return /^(\d{1,4}[./\-]\d{1,2}[./\-]\d{1,4})$/.test(str) || /^(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})$/.test(str);
}

export function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value; 

  if (typeof value === 'number') {
    const epoch = new Date(1899, 11, 30);
    const parsed = new Date(epoch.getTime() + value * 86400000);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const str = String(value).trim().replace(/[,]/g, '.').replace(/[-/]/g, '.');
  const parts = str.split('.').map((p) => p.trim()).filter(Boolean);

  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts.map((p) => +p);
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }

  if (parts.length === 3) {
    let [a, b, c] = parts.map((p) => +p);
    if (c < 100) c = 2000 + c;
    let day = a, month = b;
    if (a <= 12 && b > 12) { day = b; month = a; } 
    else if (a <= 12 && b <= 12) { month = a; day = b; }
    const date = new Date(c, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(Date.parse(str));
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}