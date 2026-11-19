import { env } from '../env.js';
import { findCity } from '../cities.js';
import { cityMatches, matchesText, norm } from '../text.js';
import { adapters, SOURCE_LABELS } from '../sources/index.js';
import type { JobHit, SearchQuery, SourceResult } from '../sources/types.js';
import { fingerprintFor, upsertJob } from '../db.js';

export interface SearchItem extends JobHit {
  id: string;
}

export interface SearchSourceSummary {
  source: string;
  label: string;
  count: number;
  durationMs: number;
  warning?: string;
  ok: boolean;
}

export interface SearchResponse {
  city: string;
  profession: string;
  items: SearchItem[];
  sources: SearchSourceSummary[];
  cached: boolean;
  tookMs: number;
  fetchedAt: string;
}

interface CacheEntry {
  at: number;
  payload: SearchResponse;
}

const cache = new Map<string, CacheEntry>();

export class SearchError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function cacheKey(city: string, profession: string): string {
  return `${norm(city)}|${norm(profession)}`;
}

async function runAdapter(adapter: (typeof adapters)[number], query: SearchQuery): Promise<SourceResult> {
  try {
    return await adapter.search(query);
  } catch (error) {
    return {
      source: adapter.source,
      label: adapter.label,
      items: [],
      warning: `${adapter.label} hatası: ${(error as Error).message}`,
      durationMs: 0,
    };
  }
}

export async function runSearch(
  input: SearchQuery,
  options: { fresh?: boolean; persist?: boolean } = {},
): Promise<SearchResponse> {
  const city = findCity(input.city);
  const profession = (input.profession ?? '').trim();

  if (!city) throw new SearchError(`Şehir bulunamadı: ${input.city}`);
  if (profession.length < 2) throw new SearchError('Meslek en az 2 karakter olmalı');

  const key = cacheKey(city.name, profession);
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < env.searchCacheMs) {
    return { ...hit.payload, cached: true };
  }

  const started = Date.now();
  const query: SearchQuery = { city: city.name, profession };
  const results = await Promise.all(adapters.map((adapter) => runAdapter(adapter, query)));

  const merged: JobHit[] = [];
  const byFingerprint = new Map<string, JobHit>();

  for (const result of results) {
    for (const item of result.items) {
      // Şehir filtresi: ülke geneli ilanlar korunur, farklı şehirler atılır.
      if (item.city && item.city !== 'Türkiye' && !cityMatches(item.city, city.name)) continue;

      // Kariyer.net / Eleman.net zaten meslek filtresi uyguluyor.
      // SecretCV ve şirket sayfalarında başlık eşleşmesi zayıf olabilir; burada eleme yapmıyoruz.
      if (item.source === 'company' && !matchesText(item.title, profession)) continue;

      const fp = fingerprintFor(item);
      const existing = byFingerprint.get(fp);
      if (existing) {
        const alsoOn = new Set<string>([
          ...((existing.meta?.alsoOn as string[] | undefined) ?? [existing.source]),
          item.source,
        ]);
        existing.meta = { ...(existing.meta ?? {}), alsoOn: [...alsoOn] };
        continue;
      }
      byFingerprint.set(fp, item);
      merged.push(item);
    }
  }

  merged.sort((a, b) => {
    const ac = Number(a.meta?.count ?? 0);
    const bc = Number(b.meta?.count ?? 0);
    if (a.source === 'iskur' && b.source !== 'iskur') return -1;
    if (b.source === 'iskur' && a.source !== 'iskur') return 1;
    if (a.source === 'iskur' && b.source === 'iskur') return bc - ac;
    const ad = a.postedAt ? Date.parse(a.postedAt) : 0;
    const bd = b.postedAt ? Date.parse(b.postedAt) : 0;
    return bd - ad;
  });

  const items: SearchItem[] = merged.map((item) => ({
    ...item,
    id: options.persist === false ? '' : upsertJob(item),
  }));

  const sources: SearchSourceSummary[] = results.map((result) => ({
    source: result.source,
    label: SOURCE_LABELS[result.source] ?? result.label,
    count: result.items.filter(
      (item) => !item.city || item.city === 'Türkiye' || cityMatches(item.city, city.name),
    ).length,
    durationMs: result.durationMs,
    warning: result.warning,
    ok: !result.warning || !/hata|HTTP|geçersiz/i.test(result.warning),
  }));

  // Çekirdek kaynaklardan biri ağ/HTTP hatası verdiyse sonucu önbelleğe alma:
  // aksi halde 10 dakika boyunca eksik liste gösterilir.
  const hardFailure = results.some(
    (result) =>
      result.source !== 'secretcv' &&
      !!result.warning &&
      /hata|HTTP|failed|timeout|Command failed/i.test(result.warning),
  );

  const payload: SearchResponse = {
    city: city.name,
    profession,
    items,
    sources,
    cached: false,
    tookMs: Date.now() - started,
    fetchedAt: new Date().toISOString(),
  };

  if (!hardFailure) cache.set(key, { at: Date.now(), payload });
  return payload;
}

export function clearSearchCache(): void {
  cache.clear();
}