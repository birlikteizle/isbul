import { fetchText, decodeEntities, stripCdata, stripTags } from '../http';
import { detectCity, matchesText } from '../text';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from '../types';

const FEED_URL = 'https://kariyerkapisi.gov.tr/RSS';
const CACHE_MS = 5 * 60_000;

let cached: { at: number; xml: string } | null = null;

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? stripTags(stripCdata(decodeEntities(match[1]))).trim() : '';
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getFeed(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.xml;
  const res = await fetchText(FEED_URL, { timeoutMs: 15_000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cached = { at: Date.now(), xml: res.text };
  return res.text;
}

export function parseKariyerKapisi(xml: string, query: SearchQuery): JobHit[] {
  const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];
  const jobs: JobHit[] = [];

  for (const [, raw] of items) {
    const title = tag(raw, 'title');
    if (!title) continue;

    const description = tag(raw, 'description');
    if (!matchesText(`${title} ${description}`, query.profession)) continue;

    const link = tag(raw, 'link') || (raw.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
    if (!link) continue;

    const category = tag(raw, 'category');
    const externalId = link.match(/[?&]i=([^&]+)/)?.[1] ?? link;
    const detectedCity = detectCity(title, description);
    if (detectedCity && detectedCity !== query.city) continue;

    jobs.push({
      source: 'kariyerkapisi',
      externalId,
      title,
      company: category || 'Kariyer Kapısı',
      city: detectedCity ?? 'Türkiye',
      url: link,
      description: description || undefined,
      postedAt: parseDate(tag(raw, 'pubDate')),
      postedAgo: null,
      meta: { scope: detectedCity ? 'city' : 'national', category },
    });
  }

  return jobs;
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