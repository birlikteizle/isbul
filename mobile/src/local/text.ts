import { CITIES, findCity, slugify, toAsciiTr } from './cities';

export { CITIES, findCity, slugify, toAsciiTr };

export function norm(value: string | undefined | null): string {
  if (!value) return '';
  return toAsciiTr(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesText(
  haystack: string | undefined | null,
  query: string | undefined | null,
): boolean {
  const q = norm(query);
  if (!q) return true;
  const h = norm(haystack);
  if (!h) return false;
  if (h.includes(q)) return true;

  const hayTokens = h.split(' ');
  return q.split(' ').every((qt) =>
    hayTokens.some((ht) => {
      if (ht === qt) return true;
      if (qt.length < 3 || ht.length < 3) return false;
      return ht.startsWith(qt) || qt.startsWith(ht);
    }),
  );
}

export function cityMatches(itemCity: string | undefined | null, targetCity: string): boolean {
  if (!itemCity) return false;
  const a = norm(itemCity);
  const b = norm(targetCity);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

export function detectCity(...values: Array<string | undefined | null>): string | null {
  const haystack = norm(values.filter(Boolean).join(' '));
  if (!haystack) return null;
  let best: { name: string; index: number } | null = null;
  for (const city of CITIES) {
    const needle = norm(city.name);
    const index = haystack.indexOf(needle);
    if (index >= 0 && (!best || index < best.index)) best = { name: city.name, index };
  }
  return best?.name ?? null;
}

export function relativeTimeToIso(value: string | undefined | null, now = Date.now()): string | null {
  if (!value) return null;
  const m = norm(value).match(/(\d+)\s*(dakika|saat|gun|hafta|ay)/);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = m[2];
  const ms: Record<string, number> = {
    dakika: 60_000,
    saat: 3_600_000,
    gun: 86_400_000,
    hafta: 7 * 86_400_000,
    ay: 30 * 86_400_000,
  };
  return new Date(now - amount * (ms[unit] ?? 0)).toISOString();
}