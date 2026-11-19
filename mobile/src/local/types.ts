export type JobSource = 'kariyernet' | 'eleman' | 'iskur' | 'kariyerkapisi';

export interface JobHit {
  source: JobSource;
  externalId: string;
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

export interface LocalJob extends JobHit {
  id: string;
}

export interface SearchQuery {
  city: string;
  profession: string;
}

export interface SourceResult {
  source: JobSource;
  label: string;
  items: JobHit[];
  warning?: string;
  durationMs: number;
}

export interface SourceAdapter {
  source: JobSource;
  label: string;
  search(query: SearchQuery): Promise<SourceResult>;
}

export interface LocalSearchResponse {
  city: string;
  profession: string;
  items: LocalJob[];
  sources: Array<{
    source: string;
    label: string;
    count: number;
    durationMs: number;
    warning?: string;
    ok: boolean;
  }>;
  cached: boolean;
  tookMs: number;
  fetchedAt: string;
}