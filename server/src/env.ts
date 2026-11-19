import 'dotenv/config';
import path from 'node:path';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export const env = {
  port: num('PORT', 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? './.data'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  scanIntervalMs: num('SCAN_INTERVAL_MS', 300_000),
  scanStartDelayMs: num('SCAN_START_DELAY_MS', 8_000),
  disableScheduler: bool('DISABLE_SCHEDULER', false),
  searchCacheMs: num('SEARCH_CACHE_MS', 600_000),
  scanToken: process.env.SCAN_TOKEN ?? '',
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  maxPagesPerSource: num('MAX_PAGES_PER_SOURCE', 1),
};