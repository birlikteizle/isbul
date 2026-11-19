import { fetchText, stripTags, absoluteUrl } from '../http.js';
import { findCity } from '../cities.js';
import { cityMatches, matchesText, relativeTimeToIso } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

const BASE = 'https://www.eleman.net';

export function parseEleman(html: string, cityName: string): JobHit[] {
  const parts = html.split('id="ilan_id_');
  const items: JobHit[] = [];

  for (const part of parts.slice(1)) {
    const externalId = part.match(/^(\d+)/)?.[1];
    if (!externalId) continue;
    const block = part;

    const href = block.match(/href="(https:\/\/www\.eleman\.net\/is-ilani\/[^"]+)"/)?.[1];
    if (!href) continue;

    const title = stripTags(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '');
    if (!title) continue;

    const company = stripTags(block.match(/hgi-corporate"><\/i>\s*([\s\S]*?)<br/)?.[1] ?? '') || undefined;
    const location = stripTags(block.match(/hgi-location-01"><\/i>\s*([\s\S]*?)<\/span>/)?.[1] ?? '');
    const locationCity = location.split('-')[0]?.trim();
    if (locationCity && !cityMatches(locationCity, cityName)) continue;

    const agoMatch = block.match(/(\d+\s*(?:dakika|saat|gün|hafta|ay)\s*önce)/i);
    const postedAgo = agoMatch?.[1] ?? null;

    items.push({
      source: 'eleman',
      externalId,
      title,
      company,
      city: locationCity || cityName,
      district: location.includes('-') ? location.split('-').slice(1).join('-').trim() : undefined,
      url: absoluteUrl(BASE, href),
      postedAt: relativeTimeToIso(postedAgo),
      postedAgo,
      description: stripTags(block.match(/c-showcase-box__text[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '') || undefined,
    });
  }

  return items;
}

export const elemanAdapter: SourceAdapter = {
  source: 'eleman',
  label: 'Eleman.net',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const city = findCity(query.city);
    if (!city) {
      return { source: this.source, label: this.label, items: [], warning: 'Geçersiz şehir', durationMs: 0 };
    }

    const items: JobHit[] = [];
    let warning: string | undefined;

    try {
      const url = `${BASE}/is-ilanlari?aranan=${encodeURIComponent(query.profession)}&arandi=e&sehir=${city.plate}`;
      const res = await fetchText(url, { minGapMs: 1_400, timeoutMs: 15_000 });
      if (!res.ok) {
        warning = `Eleman.net HTTP ${res.status}`;
      } else {
        items.push(...parseEleman(res.text, city.name));
      }

      const filtered = items.filter((item) => matchesText(item.title, query.profession));
      return {
        source: this.source,
        label: this.label,
        items: filtered,
        warning: filtered.length === 0 && !warning ? 'Eleman.net üzerinde bu aramaya uygun ilan bulunamadı' : warning,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: `Eleman.net hatası: ${(error as Error).message}`,
        durationMs: Date.now() - started,
      };
    }
  },
};