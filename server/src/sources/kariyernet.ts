import { fetchText, decodeEntities, stripTags, absoluteUrl } from '../http.js';
import { findCity, sourceSlugs } from '../cities.js';
import { cityMatches, matchesText, relativeTimeToIso, toAsciiTr } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

const BASE = 'https://www.kariyer.net';

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]).trim() : undefined;
}

export function parseKariyer(html: string, cityName: string): JobHit[] {
  const cards = [...html.matchAll(/<div data-test="ad-card"([^>]*)>([\s\S]*?)(?=<div data-test="ad-card"|$)/g)];
  const items: JobHit[] = [];

  for (const [, attrs, body] of cards) {
    const position = attr(attrs, 'positionName') ?? stripTags(body.match(/data-test="ad-card-title"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
    if (!position) continue;

    const link = body.match(/href="(\/is-ilani\/[^"]+)"/)?.[1];
    if (!link) continue;

    const cardCity = attr(attrs, 'cityName') ?? stripTags(body.match(/data-test="location"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
    if (cardCity && !cityMatches(cardCity, cityName)) continue;

    const company = stripTags(body.match(/data-test="subtitle"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '') || undefined;
    const time = attr(attrs, 'time');
    const url = absoluteUrl(BASE, link);
    const externalId = attr(attrs, 'jobCode') ?? link.match(/-(\d+)(?:\?|$)/)?.[1] ?? link;

    items.push({
      source: 'kariyernet',
      externalId,
      title: position,
      company,
      city: cardCity || cityName,
      url,
      postedAt: relativeTimeToIso(time),
      postedAgo: time ?? null,
      meta: { sponsored: attr(attrs, 'sponsor') === 'true' },
    });
  }

  return items;
}

export const kariyerNetAdapter: SourceAdapter = {
  source: 'kariyernet',
  label: 'Kariyer.net',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const city = findCity(query.city);
    if (!city) {
      return { source: this.source, label: this.label, items: [], warning: 'Geçersiz şehir', durationMs: 0 };
    }

    const slugs = sourceSlugs(city, 'kariyernet');
    const items: JobHit[] = [];
    let warning: string | undefined;

    try {
      for (const slug of slugs) {
        const url = `${BASE}/is-ilanlari/${slug}?kw=${encodeURIComponent(toAsciiTr(query.profession))}`;
        const res = await fetchText(url, { minGapMs: 1_500, timeoutMs: 15_000 });
        if (!res.ok) {
          warning = `Kariyer.net HTTP ${res.status}`;
          continue;
        }
        items.push(...parseKariyer(res.text, city.name));
      }

      // Sponsorlu ilanlar farklı şehirden gelebilir; yine de meslek filtresini uygula.
      const filtered = items.filter((item) => matchesText(item.title, query.profession));
      return {
        source: this.source,
        label: this.label,
        items: filtered,
        warning: filtered.length === 0 && !warning ? 'Kariyer.net üzerinde bu aramaya uygun ilan bulunamadı' : warning,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: `Kariyer.net hatası: ${(error as Error).message}`,
        durationMs: Date.now() - started,
      };
    }
  },
};