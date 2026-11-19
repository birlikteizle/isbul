import { fetchText, stripTags, absoluteUrl } from '../http.js';
import { findCity, sourceSlugs } from '../cities.js';
import { cityMatches, matchesText } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

const BASE = 'https://www.secretcv.com';

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

export function parseSecretCv(html: string, cityName: string): JobHit[] {
  const seen = new Set<string>();
  const items: JobHit[] = [];

  // /firma-slug/pozisyon-sehir-is-ilanlari-1234567
  const links = [...html.matchAll(/href="(https:\/\/www\.secretcv\.com\/[^"]*?-is-ilanlari-(\d+))"/g)];
  for (const [, href, externalId] of links) {
    if (seen.has(externalId)) continue;

    let path: string;
    try {
      path = new URL(href).pathname;
    } catch {
      continue;
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) continue;

    const company = titleFromSlug(segments[0]);
    const positionAndCity = segments[1].replace(/-is-ilanlari-\d+$/, '');
    const lastWord = positionAndCity.split('-').slice(-1)[0];

    let matchedCity: string | undefined;
    if (segments[1].includes(`-${cityName.toLowerCase().replace(/\s+/g, '-')}-`)) {
      matchedCity = cityName;
    } else if (cityMatches(lastWord, cityName)) {
      matchedCity = cityName;
    } else if (/-istanbul-(anadolu|avrupa)-/.test(segments[1]) && cityName === 'İstanbul') {
      matchedCity = 'İstanbul';
    }

    if (!matchedCity) continue;

    const titleSlug = positionAndCity
      .replace(/-istanbul-(anadolu|avrupa)$/, '')
      .replace(new RegExp(`-${matchedCity.toLowerCase().replace(/\s+/g, '-')}$`), '');
    const title = titleFromSlug(titleSlug);
    if (!title) continue;

    seen.add(externalId);
    items.push({
      source: 'secretcv',
      externalId,
      title,
      company,
      city: matchedCity,
      url: absoluteUrl(BASE, href),
    });
  }

  return items;
}

export const secretCvAdapter: SourceAdapter = {
  source: 'secretcv',
  label: 'SecretCV',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    const city = findCity(query.city);
    if (!city) {
      return { source: this.source, label: this.label, items: [], warning: 'Geçersiz şehir', durationMs: 0 };
    }

    const items: JobHit[] = [];
    let warning: string | undefined;

    try {
      for (const _slug of sourceSlugs(city, 'secretcv')) {
        const url = `${BASE}/is-ilanlari?k=${encodeURIComponent(query.profession)}&sh%5B%5D=${city.plate}`;
        const res = await fetchText(url, { minGapMs: 2_000, timeoutMs: 8_000 });
        if (!res.ok) {
          warning = `SecretCV HTTP ${res.status} (site bot koruması uyguluyor)`;
          continue;
        }
        items.push(...parseSecretCv(res.text, city.name));
      }

      return {
        source: this.source,
        label: this.label,
        items,
        warning: items.length === 0 && !warning ? 'SecretCV üzerinde bu aramaya uygun ilan bulunamadı' : warning,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: `SecretCV hatası: ${(error as Error).message}`,
        durationMs: Date.now() - started,
      };
    }
  },
};