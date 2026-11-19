import { XMLParser } from 'fast-xml-parser';
import { fetchText, stripTags } from '../http.js';
import { detectCity, matchesText } from '../text.js';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from './types.js';

const FEED_URL = 'https://kariyerkapisi.gov.tr/RSS';
const CACHE_MS = 5 * 60_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
});

let cached: { at: number; xml: string } | null = null;

async function getFeed(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.xml;
  const res = await fetchText(FEED_URL, { minGapMs: 2_000, timeoutMs: 12_000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cached = { at: Date.now(), xml: res.text };
  return res.text;
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']);
    if ('@_href' in obj) return String(obj['@_href']);
  }
  return '';
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseKariyerKapisi(xml: string, query: SearchQuery): JobHit[] {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  const channel = doc?.rss?.channel;
  if (!channel) return [];

  let rawItems = channel.item ?? [];
  if (!Array.isArray(rawItems)) rawItems = [rawItems];

  const items: JobHit[] = [];

  for (const raw of rawItems) {
    const title = stripTags(asText(raw.title));
    if (!title) continue;
    const description = stripTags(asText(raw.description));
    const category = stripTags(asText(raw.category));
    if (!matchesText(`${title} ${description}`, query.profession)) continue;

    const link = asText(raw.link) || asText(raw.guid);
    if (!link) continue;

    const externalId = link.match(/[?&]i=([^&]+)/)?.[1] ?? link;
    const detectedCity = detectCity(title, description);

    // Şehir bilgisi başlıkta yoksa kamu ilanı ülke geneli kabul edilir.
    if (detectedCity && detectedCity !== query.city) continue;

    items.push({
      source: 'kariyerkapisi',
      externalId,
      title,
      company: category || 'Kariyer Kapısı',
      city: detectedCity ?? 'Türkiye',
      url: link,
      description: description || undefined,
      postedAt: parseDate(asText(raw.pubDate)),
      postedAgo: null,
      meta: { scope: detectedCity ? 'city' : 'national', category },
    });
  }

  return items;
}

export const kariyerKapisiAdapter: SourceAdapter = {
  source: 'kariyerkapisi',
  label: 'Kariyer Kapısı',
  async search(query: SearchQuery): Promise<SourceResult> {
    const started = Date.now();
    try {
      const xml = await getFeed();
      const items = parseKariyerKapisi(xml, query);
      return {
        source: this.source,
        label: this.label,
        items: items.slice(0, 25),
        warning: items.length === 0 ? 'Kariyer Kapısı RSS beslemesinde eşleşen kamu ilanı yok' : undefined,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        source: this.source,
        label: this.label,
        items: [],
        warning: `Kariyer Kapısı hatası: ${(error as Error).message}`,
        durationMs: Date.now() - started,
      };
    }
  },
};