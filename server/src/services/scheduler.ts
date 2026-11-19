import { env } from '../env.js';
import {
  addMatch,
  getState,
  listSearches,
  markMatchesNotified,
  markSearchChecked,
  matchExists,
  pruneOldJobs,
  setState,
  upsertJob,
} from '../db.js';
import { norm } from '../text.js';
import { runSearch, type SearchItem } from './search.js';
import { notifyNewJobs } from './notify.js';

export interface ScanSummary {
  startedAt: string;
  finishedAt: string;
  searches: number;
  queries: number;
  newJobs: number;
  notified: number;
  errors: string[];
  skipped?: boolean;
}

let running = false;

async function maybePrune(): Promise<void> {
  const last = getState('last_prune');
  if (last && Date.now() - Date.parse(last) < 86_400_000) return;
  try {
    pruneOldJobs(30);
    setState('last_prune', new Date().toISOString());
  } catch {
    // temizlik başarısız olsa da tarama devam etsin
  }
}

export async function scanAll(log: { info: Function; warn: Function; error: Function }): Promise<ScanSummary> {
  const startedAt = new Date().toISOString();
  if (running) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      searches: 0,
      queries: 0,
      newJobs: 0,
      notified: 0,
      errors: [],
      skipped: true,
    };
  }

  running = true;
  const errors: string[] = [];
  let newJobs = 0;
  let notified = 0;

  try {
    await maybePrune();

    const searches = listSearches(undefined, true);
    if (searches.length === 0) {
      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        searches: 0,
        queries: 0,
        newJobs: 0,
        notified: 0,
        errors,
      };
    }

    const groups = new Map<string, typeof searches>();
    for (const search of searches) {
      const key = `${norm(search.city)}|${norm(search.profession)}`;
      const group = groups.get(key);
      if (group) group.push(search);
      else groups.set(key, [search]);
    }

    log.info(`Tarama başladı: ${searches.length} kayıtlı arama, ${groups.size} benzersiz sorgu.`);

    for (const group of groups.values()) {
      const [{ city, profession }] = group;
      let result;
      try {
        result = await runSearch({ city, profession }, { fresh: true, persist: true });
      } catch (error) {
        errors.push(`${city} / ${profession}: ${(error as Error).message}`);
        continue;
      }

      for (const search of group) {
        const fresh: SearchItem[] = [];

        for (const item of result.items) {
          if (item.id && !matchExists(search.id, item.id)) {
            addMatch(search.id, item.id, null);
            fresh.push(item);
          } else if (!item.id) {
            // Güvenlik ağı: persist kapalıysa id üret.
            const id = upsertJob(item);
            if (!matchExists(search.id, id)) {
              addMatch(search.id, id, null);
              fresh.push({ ...item, id });
            }
          }
        }

        if (fresh.length > 0) {
          newJobs += fresh.length;
          const sent = await notifyNewJobs(search, fresh);
          if (sent) notified++;
          markMatchesNotified(
            search.id,
            fresh.map((item) => item.id),
          );
        }

        markSearchChecked(search.id);
      }
    }

    const summary: ScanSummary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      searches: searches.length,
      queries: groups.size,
      newJobs,
      notified,
      errors,
    };
    log.info(`Tarama bitti: ${newJobs} yeni ilan, ${notified} bildirim.`);
    return summary;
  } finally {
    running = false;
  }
}

export function startScheduler(log: { info: Function; warn: Function; error: Function }): () => void {
  if (env.disableScheduler) {
    log.warn('Zamanlayıcı kapalı (DISABLE_SCHEDULER=1).');
    return () => undefined;
  }

  const interval = Math.max(60_000, env.scanIntervalMs);
  log.info(`Zamanlayıcı aktif: her ${Math.round(interval / 1000)} saniyede bir taranacak.`);

  const first = setTimeout(() => {
    void scanAll(log);
  }, env.scanStartDelayMs);

  const timer = setInterval(() => {
    void scanAll(log);
  }, interval);

  // Sunucu kapanırken temiz çıkış
  if (typeof timer.unref === 'function') timer.unref();
  if (typeof first.unref === 'function') first.unref();

  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}