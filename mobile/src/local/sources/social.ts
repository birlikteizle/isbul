import { fetchText, decodeEntities, stripTags } from '../http';
import { ddgDf, type DateRange } from '../dateRange';
import { braveSocialSearch } from './brave';
import type { JobHit, SearchQuery, SourceAdapter, SourceResult } from '../types';

const BASE = 'https://html.duckduckgo.com/html/';
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { at: number; html: string }>();
let ddgBlockedUntil = 0;

const ALLOWED_HOSTS = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com'];

function isAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function platformOf(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('facebook')) return 'Facebook';
    if (host.includes('x.com') || host.includes('twitter')) return 'X';
    if (host.includes('linkedin')) return 'LinkedIn';
    return host;
  } catch {
    return 'Sosyal Medya';
  }
}

function decodeDdgLink(href: string): string | null {
  let value = href;
  if (value.startsWith('//')) value = `https:${value}`;
  try {
    const url = new URL(value);
    const target = url.searchParams.get('uddg');
    if (target) return decodeURIComponent(target);
    return value;
  } catch {
    return null;
  }
}

async function ddg(query: string, range: DateRange): Promise<string> {
  if (Date.now() < ddgBlockedUntil) {
    throw new Error('DuckDuckGo geçici olarak sınırlandı');
  }

  const key = `${query}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.html;

  const df = ddgDf(range);
  const url = `${BASE}?q=${encodeURIComponent(query)}${df ? `&df=${df}` : ''}&kl=tr-tr`;
  const res = await fetchText(url, { timeoutMs: 15_000 });

  if (res.status === 202 || res.status === 429 || res.text.includes('anomaly-modal')) {
    ddgBlockedUntil = Date.now() + 30 * 60_000;
    throw new Error('DuckDuckGo geçici olarak sınırlandı');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  cache.set(key, { at: Date.now(), html: res.text });
  return res.text;
}

export function parseDuckDuckGo(html: string): JobHit[] {
  const anchors = [
    ...html.matchAll(
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)].map(
    (match) => stripTags(match[1]),
  );

  const jobs: JobHit[] = [];

  anchors.forEach((match, index) => {
    const target = decodeDdgLink(decodeEntities(match[1]));
    if (!target || !isAllowed(target)) return;

    const title = stripTags(match[2]);
    if (!title) return;

    const platform = platformOf(target);
    jobs.push({
      source: 'social',
      externalId: target,
      title,
      company: platform,
      url: target,
      description: snippets[index] || undefined,
      postedAt: null,
      postedAgo: null,
      meta: { kind: 'social', platform, note: 'Sosyal medya sonucu; tarih kesin değil' },
    });
  });

  const unique = new Map<string, JobHit>();
  for (const job of jobs) unique.set(job.url, job);
  return [...unique.values()];
}

export const socialAdapter: SourceAdapter = {
  source: 'social',
  label: 'Sosyal Medya',
  async search(query: SearchQuery, range: DateRange = 'all'): Promise<SourceResult> {
    const started = Date.now();
    const items: JobHit[] = [];
    const warnings: string[] = [];
    let approximate = false;

    // 1) DuckDuckGo: doğrudan gönderi/reel linkleri
    if (Date.now() >= ddgBlockedUntil) {
      try {
        const q = `site:instagram.com ${query.city} ${query.profession} iş`;
        let parsed = parseDuckDuckGo(await ddg(q, range));
        if (parsed.length === 0 && range !== 'all') {
          parsed = parseDuckDuckGo(await ddg(q, 'all'));
          if (parsed.length > 0) approximate = true;
        }
        items.push(...parsed);
      } catch (error) {
        warnings.push((error as Error).message);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 700));

    // 2) Brave: Instagram/Facebook hesapları (DDG engellendiğinde yedek)
    for (const platform of ['instagram', 'facebook'] as const) {
      try {
        const result = await braveSocialSearch(
          `${query.city} ${query.profession} iş ilanı`,
          platform,
          range,
        );
        if (result.warning) {
          warnings.push(result.warning);
          approximate = true;
        }
        items.push(...result.items);
      } catch (error) {
        warnings.push((error as Error).message);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const unique = new Map<string, JobHit>();
    for (const item of items) unique.set(item.url, item);

    return {
      source: this.source,
      label: this.label,
      items: [...unique.values()].slice(0, 30),
      warning:
        unique.size === 0
          ? warnings.length > 0
            ? `Sosyal medya şu an yanıt vermiyor (${warnings[0]}). Birkaç dakika sonra tekrar dene.`
            : 'Sosyal medyada eşleşen gönderi bulunamadı'
          : approximate
            ? 'Sosyal medya tarih filtresi yaklaşık uygulandı.'
            : warnings.length > 0
              ? `Bazı platformlar yanıt vermedi (${warnings[0]})`
              : undefined,
      durationMs: Date.now() - started,
    };
  },
};