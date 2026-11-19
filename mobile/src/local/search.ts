import { findCity } from './cities';
import { cityMatches, norm } from './text';
import { kariyerNetAdapter } from './sources/kariyernet';
import { elemanAdapter } from './sources/eleman';
import { iskurAdapter } from './sources/iskur';
import { kariyerKapisiAdapter } from './sources/kariyerkapisi';
import type { LocalJob, LocalSearchResponse, SearchQuery, SourceAdapter, SourceResult } from './types';

const adapters: SourceAdapter[] = [
  kariyerNetAdapter,
  elemanAdapter,
  iskurAdapter,
  kariyerKapisiAdapter,
];

const cache = new Map<string, { at: number; payload: LocalSearchResponse }>();
const CACHE_MS = 5 * 60_000;

function fingerprint(job: LocalJob): string {
  return `${norm(job.title)}|${norm(job.company)}|${norm(job.city)}`;
}

async function safeSearch(adapter: SourceAdapter, query: SearchQuery): Promise<SourceResult> {
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

export async function runLocalSearch(
  cityInput: string,
  profession: string,
  options: { fresh?: boolean } = {},
): Promise<LocalSearchResponse> {
  const city = findCity(cityInput);
  const trimmed = (profession ?? '').trim();
  if (!city) throw new Error(`Şehir bulunamadı: ${cityInput}`);
  if (trimmed.length < 2) throw new Error('Meslek en az 2 karakter olmalı');

  const key = `${norm(city.name)}|${norm(trimmed)}`;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true };
  }

  const started = Date.now();
  const query: SearchQuery = { city: city.name, profession: trimmed };
  const results = await Promise.all(adapters.map((adapter) => safeSearch(adapter, query)));

  const jobs: LocalJob[] = [];
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
      jobs.push(job);
    }
  }

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
    count: result.items.filter(
      (item) => !item.city || item.city === 'Türkiye' || cityMatches(item.city, city.name),
    ).length,
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
  };

  if (!hardFailure) cache.set(key, { at: Date.now(), payload });
  return payload;
}

export function clearLocalSearchCache(): void {
  cache.clear();
}

export const LOCAL_SOURCES = adapters.map((adapter) => ({
  source: adapter.source,
  label: adapter.label,
}));