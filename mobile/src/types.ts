export interface SearchItem {
  id: string;
  source: string;
  externalId?: string;
  title: string;
  company?: string;
  city?: string;
  district?: string;
  url: string;
  description?: string;
  postedAt?: string | null;
  postedAgo?: string | null;
  meta?: Record<string, unknown>;
}

export interface SourceSummary {
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
  sources: SourceSummary[];
  cached: boolean;
  tookMs: number;
  fetchedAt: string;
}

export interface SearchRow {
  id: string;
  device_id: string;
  city: string;
  profession: string;
  active: number;
  created_at: string;
  last_checked_at: string | null;
  match_count: number;
  last_match_at: string | null;
  last_notified_at: string | null;
}

export interface NotificationRow {
  id: string;
  device_id: string;
  search_id: string | null;
  job_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface CityInfo {
  name: string;
  plate: number;
}

export interface Meta {
  app: string;
  version: string;
  cities: CityInfo[];
  sources: Array<{ source: string; label: string }>;
  pushEnabled: boolean;
  scanIntervalSeconds: number;
}

export interface DeviceRow {
  id: string;
  push_token: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
}