export type JobSource =
  | 'kariyernet'
  | 'eleman'
  | 'secretcv'
  | 'iskur'
  | 'kariyerkapisi'
  | 'company';

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
  /** İŞKUR açık iş sayısı gibi ek bilgiler */
  meta?: Record<string, unknown>;
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