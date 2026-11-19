import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NotificationRow, SearchRow } from '../types';

const KEY = 'isbul.local.state.v1';

export interface LocalSearch extends SearchRow {
  seenIds: string[];
}

export interface LocalState {
  version: 1;
  searches: LocalSearch[];
  notifications: NotificationRow[];
  last_check_at: string | null;
}

const EMPTY: LocalState = {
  version: 1,
  searches: [],
  notifications: [],
  last_check_at: null,
};

let cached: LocalState | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadLocalState(): Promise<LocalState> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      cached = { ...EMPTY };
      return cached;
    }
    const parsed = JSON.parse(raw) as LocalState;
    cached = {
      version: 1,
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      last_check_at: parsed.last_check_at ?? null,
    };
    return cached;
  } catch {
    cached = { ...EMPTY };
    return cached;
  }
}

async function save(state: LocalState): Promise<void> {
  cached = state;
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export function updateLocalState(
  mutator: (state: LocalState) => LocalState | void,
): Promise<LocalState> {
  const run = async (): Promise<LocalState> => {
    const state = await loadLocalState();
    const next = mutator(state) ?? state;
    await save(next);
    return next;
  };
  const result = writeChain.then(run, run);
  writeChain = result.catch(() => undefined);
  return result;
}

export const localActions = {
  addSearch(city: string, profession: string, baselineIds: string[]) {
    return updateLocalState((state) => {
      const now = new Date().toISOString();
      const existing = state.searches.find(
        (search) => search.city === city && search.profession === profession,
      );

      if (existing) {
        return {
          ...state,
          searches: state.searches.map((search) =>
            search.id === existing.id
              ? {
                  ...search,
                  active: 1,
                  last_checked_at: now,
                  match_count: Math.max(search.match_count, baselineIds.length),
                  seenIds: search.seenIds.length > 0 ? search.seenIds : baselineIds,
                }
              : search,
          ),
        };
      }

      const search: LocalSearch = {
        id: newId(),
        device_id: 'local',
        city,
        profession,
        active: 1,
        created_at: now,
        last_checked_at: now,
        match_count: baselineIds.length,
        last_match_at: now,
        last_notified_at: null,
        seenIds: baselineIds,
      };

      return { ...state, searches: [search, ...state.searches] };
    });
  },

  setActive(id: string, active: boolean) {
    return updateLocalState((state) => ({
      ...state,
      searches: state.searches.map((search) =>
        search.id === id ? { ...search, active: active ? 1 : 0 } : search,
      ),
    }));
  },

  removeSearch(id: string) {
    return updateLocalState((state) => ({
      ...state,
      searches: state.searches.filter((search) => search.id !== id),
    }));
  },

  markAllRead() {
    const now = new Date().toISOString();
    return updateLocalState((state) => ({
      ...state,
      notifications: state.notifications.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? now,
      })),
    }));
  },

  clearNotifications() {
    return updateLocalState((state) => ({
      ...state,
      notifications: [],
      searches: state.searches.map((search) => ({ ...search, last_notified_at: null })),
    }));
  },

  reset() {
    return updateLocalState(() => ({ ...EMPTY, searches: [], notifications: [] }));
  },
};

export interface CheckResult {
  searchId: string;
  items: Array<{ id: string; title: string; company?: string }>;
}

export interface AppliedCheck {
  state: LocalState;
  notifications: NotificationRow[];
}

/** Arka plan kontrolünün sonuçlarını duruma işler; yeni ilanlar için bildirim üretir. */
export function applyCheckResults(results: CheckResult[]): Promise<AppliedCheck> {
  const created: NotificationRow[] = [];

  const promise = updateLocalState((state) => {
    const now = new Date().toISOString();
    const searches = state.searches.map((search) => {
      const result = results.find((item) => item.searchId === search.id);
      if (!result) return search;

      const seen = new Set(search.seenIds);
      const wasBaselined = search.seenIds.length > 0 || !!search.last_match_at;

      // İlk kontrol: mevcut ilanları "görüldü" kabul et, bildirim gönderme.
      // (Kaydetme sırasında baseline alındıysa last_match_at doludur; 0 sonuçlu aramalarda
      // sonradan çıkan ilk ilan bildirilir.)
      if (!wasBaselined) {
        return {
          ...search,
          seenIds: result.items.map((item) => item.id).slice(-400),
          match_count: result.items.length,
          last_checked_at: now,
          last_match_at: now,
        };
      }

      const fresh = result.items.filter((item) => !seen.has(item.id));

      if (fresh.length > 0) {
        const first = fresh[0];
        created.push({
          id: newId(),
          device_id: 'local',
          search_id: search.id,
          job_id: first.id,
          title: `${search.city} · ${search.profession}`,
          body:
            fresh.length === 1
              ? `${first.title}${first.company ? ` — ${first.company}` : ''}`
              : `${fresh.length} yeni ilan: ${first.title}${first.company ? ` — ${first.company}` : ''}`,
          created_at: now,
          read_at: null,
        });
      }

      return {
        ...search,
        seenIds: [...search.seenIds, ...fresh.map((item) => item.id)].slice(-400),
        match_count: result.items.length,
        last_checked_at: now,
        last_match_at: now,
        last_notified_at: fresh.length > 0 ? now : search.last_notified_at,
      };
    });

    return {
      ...state,
      searches,
      notifications: [...created.slice().reverse(), ...state.notifications].slice(0, 100),
      last_check_at: now,
    };
  });

  return promise.then((state) => ({ state, notifications: created }));
}

export function setLastCheck(iso: string) {
  return updateLocalState((state) => ({ ...state, last_check_at: iso }));
}