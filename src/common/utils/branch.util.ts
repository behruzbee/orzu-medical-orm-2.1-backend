const KNOWN_BRANCH_NAMES: Array<{ patterns: string[]; label: string }> = [
  {
    patterns: ['ЗАНГИОТА', 'ZANGIOTA'],
    label: 'Зангиота филиал',
  },
  {
    patterns: ['ЮНУСОБОД', 'ЮНУСАБАД', 'YUNUSOBOD', 'YUNUSABAD'],
    label: 'Юнусобод филиал',
  },
];

export function formatBranchName(branch?: string | null): string | null {
  if (!branch) return null;

  const normalized = branch.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  const knownBranch = KNOWN_BRANCH_NAMES.find((item) =>
    item.patterns.some((pattern) => upper.includes(pattern)),
  );

  if (knownBranch) {
    return knownBranch.label;
  }

  const withoutFilialSuffix = normalized
    .replace(/\bфилиали\b/gi, '')
    .replace(/\bфилиал\b/gi, '')
    .replace(/\bfiliali\b/gi, '')
    .replace(/\bfilial\b/gi, '')
    .trim();

  const base = withoutFilialSuffix || normalized;
  const formattedBase = base
    .toLocaleLowerCase('ru-RU')
    .replace(/(^|\s|-)(\p{L})/gu, (match) => match.toLocaleUpperCase('ru-RU'));

  return `${formattedBase} филиал`;
}
