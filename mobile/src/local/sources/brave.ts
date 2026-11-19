import { fetchText, decodeEntities } from '../http';
import { ddgDf, type DateRange } from '../dateRange';
import type { JobHit } from '../types';

const BASE = 'https://search.brave.com/search';
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { at: number; html: string }>();

function braveTf(range: DateRange): string {
  // Brave: pd = son gün, pw = son hafta, pm = son ay
  const df = ddgDf(range);
  if (df === 'd') return 'pd';
  if (df === 'w') return 'pw';
  if (df === 'm') return 'pm';
  return '';
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*[•|]\s*Instagram photos and videos.*$/i, '')
    .replace(/\s*\|\s*Facebook.*$/i, '')
    .replace(/\s*\/\s*X.*$/i, '')
    .trim();
}

export function parseBrave(html: string, platform: 'instagram' | 'facebook'): JobHit[] {
  const titles = [
    ...html.matchAll(/<div class="title search-snippet-title[^"]*"[^>]*title="([^"]*)"/g),
  ];
  const items: JobHit[] = [];
  const seen = new Set<string>();

  for (const match of titles) {
    const rawTitle = decodeEntities(match[1]);
    const user = rawTitle.match(/\(@([A-Za-z0-9_.]+)\)/)?.[1];
    if (!user) continue;

    const url =
      platform === 'instagram'
        ? `https://www.instagram.com/${user}/`
        : `https://www.facebook.com/${user}`;
    if (seen.has(url)) continue;
    seen.add(url);

    const title = cleanTitle(rawTitle);
    if (!title) continue;

    items.push({
      source: 'social',
      externalId: url,
      title,
      company: platform === 'instagram' ? 'Instagram' : 'Facebook',
      url,
      postedAt: null,
      postedAgo: null,
      meta: {
        kind: 'social',
        platform: platform === 'instagram' ? 'Instagram' : 'Facebook',
        note: 'Sosyal medya hesabı; tarih kesin değil',
      },
    });
  }

  return items;
}

export async function braveSocialSearch(
  query: string,
  platform: 'instagram' | 'facebook',
  range: DateRange,
): Promise<{ items: JobHit[]; warning?: string }> {
  const site = platform === 'instagram' ? 'site:instagram.com' : 'site:facebook.com';
  const fullQuery = `${site} ${query}`;
  const key = `${fullQuery}|${range}`;
  const hit = cache.get(key);

  let html: string;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    html = hit.html;
  } else {
    const tf = braveTf(range);
    const url = `${BASE}?q=${encodeURIComponent(fullQuery)}&source=web${tf ? `&tf=${tf}` : ''}`;
    const res = await fetchText(url, { timeoutMs: 15_000 });
    if (!res.ok) return { items: [], warning: `Brave HTTP ${res.status}` };
    html = res.text;
    cache.set(key, { at: Date.now(), html });
  }

  let items = parseBrave(html, platform);

  // Tarih filtresi sonuçları sıfırlarsa filtresiz dene; sonuçlar yaklaşık olur.
  if (items.length === 0 && range !== 'all') {
    const url = `${BASE}?q=${encodeURIComponent(fullQuery)}&source=web`;
    const res = await fetchText(url, { timeoutMs: 15_000 });
    if (res.ok) {
      items = parseBrave(res.text, platform);
      if (items.length > 0) {
        return { items, warning: 'Sosyal medya tarih filtresi yaklaşık uygulandı.' };
      }
    }
  }

  return { items };
}