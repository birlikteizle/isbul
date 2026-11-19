export type DateRange = 'all' | '1d' | '7d' | '14d' | '30d';

export const DATE_RANGES: Array<{ key: DateRange; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: '1d', label: 'Son 24 saat' },
  { key: '7d', label: 'Son 1 hafta' },
  { key: '14d', label: 'Son 2 hafta' },
  { key: '30d', label: 'Son 1 ay' },
];

const DAY = 86_400_000;

export function rangeCutoff(range: DateRange, now = Date.now()): number | null {
  switch (range) {
    case '1d':
      return now - DAY;
    case '7d':
      return now - 7 * DAY;
    case '14d':
      return now - 14 * DAY;
    case '30d':
      return now - 30 * DAY;
    default:
      return null;
  }
}

export function googleWhen(range: DateRange): string {
  switch (range) {
    case '1d':
      return ' when:1d';
    case '7d':
      return ' when:7d';
    case '14d':
    case '30d':
      return ' when:1m';
    default:
      return '';
  }
}

export function ddgDf(range: DateRange): string {
  switch (range) {
    case '1d':
      return 'd';
    case '7d':
      return 'w';
    case '14d':
    case '30d':
      return 'm';
    default:
      return '';
  }
}