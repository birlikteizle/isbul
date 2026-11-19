import { fetchText, decodeEntities, stripCdata, stripTags } from '../http';
import { norm } from '../text';
import { googleWhen, type DateRange } from '../dateRange';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from '../types';

const BASE = 'https://news.google.com/rss/search';
const CACHE_MS = 5 * 60_000;

const cache = new Map<string, { at: number; xml: string }>();

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? stripTags(stripCdata(decodeEntities(match[1]))).trim() : '';
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getFeed(query: string, range: DateRange): Promise<string> {
  const key = `${query}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.xml;

  const url = `${BASE}?q=${encodeURIComponent(query + googleWhen(range))}&hl=tr&gl=TR&ceid=TR:tr`;
  const res = await fetchText(url, { timeoutMs: 15_000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cache.set(key, { at: Date.now(), xml: res.text });
  return res.text;
}

export function parseGoogleNews(xml: string, query: SearchQuery): JobHit[] {
  const cityKey = norm(query.city);
  const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];
  const jobs: JobHit[] = [];
  const seen = new Set<string>();

  for (const [, raw] of items) {
    const title = tag(raw, 'title');
    if (!title) continue;

    const description = tag(raw, 'description');
    const haystack = `${title} ${description}`;
    if (!norm(haystack).includes(cityKey)) continue;
    if (!norm(haystack).includes(norm(query.profession))) continue;

    const link = tag(raw, 'link') || (raw.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const source = tag(raw, 'source') || 'Haber';
    const externalId = link.match(/articles\/([^?]+)/)?.[1] ?? link;

    jobs.push({
      source: 'news',
      externalId,
      title,
      company: source,
      city: query.city,
      url: link,
      description: description || undefined,
      postedAt: parseDate(tag(raw, 'pubDate')),
      postedAgo: null,
      meta: { kind: 'news', source },
    });
  }

  return jobs;
}

export const newsAdapter: SourceAdapter = {
  source: 'news',
  label: 'Haberler',
  async search(query: SearchQuery, range: DateRange = 'all'): Promise<SourceResult> {
    const started = Date.now();
    const jobs: JobHit[] = [];
    const warnings: string[] = [];

    // İki farklı haber dili: "iş ilanı" ve "personel alımı".
    for (const phrase of ['iş ilanı', 'personel alımı']) {
      try {
        const xml = await getFeed(`${query.city} ${query.profession} ${phrase}`, range);
        jobs.push(...parseGoogleNews(xml, query));
      } catch (error) {
        warnings.push((error as Error).message);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const unique = new Map<string, JobHit>();
    for (const job of jobs) unique.set(job.url, job);

    return {
      source: this.source,
      label: this.label,
      items: [...unique.values()].slice(0, 20),
      warning: unique.size === 0 ? 'Haber kaynaklarında eşleşen güncel ilan haberi yok' : undefined,
      durationMs: Date.now() - started,
    };
  },
};