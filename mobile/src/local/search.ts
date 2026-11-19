import { findCity } from './cities';
import { cityMatches, norm } from './text';
import { rangeCutoff, type DateRange } from './dateRange';
import { kariyerNetAdapter } from './sources/kariyernet';
import { elemanAdapter } from './sources/eleman';
import { iskurAdapter } from './sources/iskur';
import { kariyerKapisiAdapter } from './sources/kariyerkapisi';
import { newsAdapter } from './sources/news';
import { socialAdapter } from './sources/social';
import type { LocalJob, LocalSearchResponse, SearchQuery, SourceAdapter, SourceResult } from './types';

const adapters: SourceAdapter[] = [
  kariyerNetAdapter,
  elemanAdapter,
  iskurAdapter,
  kariyerKapisiAdapter,
  newsAdapter,
  socialAdapter,
];

const cache = new Map<string, { at: number; payload: LocalSearchResponse }>();
const CACHE_MS = 5 * 60_000;

function fingerprint(job: LocalJob): string {
  return `${norm(job.title)}|${norm(job.company)}|${norm(job.city)}`;
}

async function safeSearch(
  adapter: SourceAdapter,
  query: SearchQuery,
  range: DateRange,
): Promise<SourceResult> {
  try {
    return await adapter.search(query, range);
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

export async function runLocalSearch(
  cityInput: string,
  profession: string,
  options: { fresh?: boolean; range?: DateRange; skipSocial?: boolean } = {},
): Promise<LocalSearchResponse> {
  const city = findCity(cityInput);
  const trimmed = (profession ?? '').trim();
  if (!city) throw new Error(`Şehir bulunamadı: ${cityInput}`);
  if (trimmed.length < 2) throw new Error('Meslek en az 2 karakter olmalı');

  const range: DateRange = options.range ?? 'all';
  const key = `${norm(city.name)}|${norm(trimmed)}|${range}${options.skipSocial ? '|nosocial' : ''}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true };
  }

  const started = Date.now();
  const query: SearchQuery = { city: city.name, profession: trimmed };
  const activeAdapters = options.skipSocial
    ? adapters.filter((adapter) => adapter.source !== 'social')
    : adapters;
  const results = await Promise.all(
    activeAdapters.map((adapter) => safeSearch(adapter, query, range)),
  );

  const allJobs: LocalJob[] = [];
  const byId = new Set<string>();
  const byFingerprint = new Map<string, LocalJob>();

  for (const result of results) {
    for (const item of result.items) {
      if (item.city && item.city !== 'Türkiye' && !cityMatches(item.city, city.name)) continue;

      const id = `${item.source}:${item.externalId}`;
      if (byId.has(id)) continue;

      const fp = fingerprint({ ...item, id });
      const existing = byFingerprint.get(fp);
      if (existing) {
        const alsoOn = new Set<string>([
          ...((existing.meta?.alsoOn as string[] | undefined) ?? [existing.source]),
          item.source,
        ]);
        existing.meta = { ...(existing.meta ?? {}), alsoOn: [...alsoOn] };
        continue;
      }

      const job: LocalJob = { ...item, id };
      byFingerprint.set(fp, job);
      byId.add(id);
      allJobs.push(job);
    }
  }

  const cutoff = rangeCutoff(range);
  const jobs = cutoff
    ? allJobs.filter((job) => {
        // İŞKUR güncel bir anlık görüntü, sosyal medya ise DDG'nin tarih filtresiyle geldi.
        if (job.source === 'iskur' || job.source === 'social') return true;
        if (!job.postedAt) return false;
        const time = Date.parse(job.postedAt);
        return Number.isFinite(time) && time >= cutoff;
      })
    : allJobs;

  jobs.sort((a, b) => {
    if (a.source === 'iskur' && b.source !== 'iskur') return -1;
    if (b.source === 'iskur' && a.source !== 'iskur') return 1;
    if (a.source === 'iskur' && b.source === 'iskur') {
      return Number(b.meta?.count ?? 0) - Number(a.meta?.count ?? 0);
    }
    const ad = a.postedAt ? Date.parse(a.postedAt) : 0;
    const bd = b.postedAt ? Date.parse(b.postedAt) : 0;
    return bd - ad;
  });

  const sources = results.map((result) => ({
    source: result.source,
    label: result.label,
    count: jobs.filter((job) => job.source === result.source).length,
    durationMs: result.durationMs,
    warning: result.warning,
    ok: !result.warning || !/hata|HTTP|geçersiz|yanıt vermedi/i.test(result.warning),
  }));

  const hardFailure = results.some(
    (result) =>
      !!result.warning && /hata|HTTP|failed|timeout|yanıt vermedi/i.test(result.warning),
  );

  const payload: LocalSearchResponse = {
    city: city.name,
    profession: trimmed,
    items: jobs,
    sources,
    cached: false,
    tookMs: Date.now() - started,
    fetchedAt: new Date().toISOString(),
    allIds: allJobs.map((job) => job.id),
  };

  if (!hardFailure && !options.skipSocial) cache.set(key, { at: Date.now(), payload });
  return payload;
}

export function clearLocalSearchCache(): void {
  cache.clear();
}

export const LOCAL_SOURCES = adapters.map((adapter) => ({
  source: adapter.source,
  label: adapter.label,
}));