import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { env } from './env.js';
import { norm } from './text.js';
import type { JobHit } from './sources/types.js';

export interface DeviceRow {
  id: string;
  push_token: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchRow {
  id: string;
  device_id: string;
  city: string;
  profession: string;
  active: number;
  created_at: string;
  last_checked_at: string | null;
}

export interface SearchWithCount extends SearchRow {
  match_count: number;
  last_match_at: string | null;
  last_notified_at: string | null;
}

export interface JobRow {
  id: string;
  source: string;
  external_id: string;
  title: string;
  company: string | null;
  city: string | null;
  district: string | null;
  url: string;
  description: string | null;
  posted_at: string | null;
  posted_ago: string | null;
  meta: string | null;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
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

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  push_token TEXT,
  platform TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_push_token ON devices(push_token) WHERE push_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  profession TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  UNIQUE (device_id, city, profession)
);
CREATE INDEX IF NOT EXISTS idx_searches_device ON searches(device_id);
CREATE INDEX IF NOT EXISTS idx_searches_active ON searches(active);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  city TEXT,
  district TEXT,
  url TEXT NOT NULL,
  description TEXT,
  posted_at TEXT,
  posted_ago TEXT,
  meta TEXT,
  fingerprint TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);

CREATE TABLE IF NOT EXISTS search_jobs (
  search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  first_seen_at TEXT NOT NULL,
  notified_at TEXT,
  PRIMARY KEY (search_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_search_jobs_job ON search_jobs(job_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  search_id TEXT,
  job_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_device ON notifications(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS source_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const db = (() => {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const file = path.join(env.dataDir, 'isbul.sqlite');
  const instance = new DatabaseSync(file);
  instance.exec(SCHEMA);
  return instance;
})();

export function nowIso(): string {
  return new Date().toISOString();
}

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function jobIdFor(hit: JobHit): string {
  return sha(`${hit.source}:${hit.externalId}`).slice(0, 24);
}

export function fingerprintFor(hit: JobHit): string {
  return sha(`${norm(hit.title)}|${norm(hit.company)}|${norm(hit.city)}`).slice(0, 24);
}

/* ------------------------------- cihazlar ------------------------------- */

export function getDevice(id: string): DeviceRow | null {
  return (db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as unknown as DeviceRow) ?? null;
}

export function getDeviceByToken(token: string): DeviceRow | null {
  return (db.prepare('SELECT * FROM devices WHERE push_token = ?').get(token) as unknown as DeviceRow) ?? null;
}

export function createDevice(pushToken?: string | null, platform?: string | null): DeviceRow {
  const now = nowIso();
  if (pushToken) {
    const existing = getDeviceByToken(pushToken);
    if (existing) {
      db.prepare('UPDATE devices SET platform = COALESCE(?, platform), updated_at = ? WHERE id = ?').run(
        platform ?? null,
        now,
        existing.id,
      );
      return getDevice(existing.id)!;
    }
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO devices (id, push_token, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    pushToken ?? null,
    platform ?? null,
    now,
    now,
  );
  return getDevice(id)!;
}

export function updateDeviceToken(id: string, pushToken: string | null): void {
  if (pushToken) {
    const owner = getDeviceByToken(pushToken);
    if (owner && owner.id !== id) {
      // Token başka cihaza geçmişse eski kayıttan düşür.
      db.prepare('UPDATE devices SET push_token = NULL WHERE id = ?').run(owner.id);
    }
  }
  db.prepare('UPDATE devices SET push_token = ?, updated_at = ? WHERE id = ?').run(pushToken, nowIso(), id);
}

export function clearDeviceToken(pushToken: string): void {
  db.prepare('UPDATE devices SET push_token = NULL, updated_at = ? WHERE push_token = ?').run(nowIso(), pushToken);
}

/* ------------------------------ aramalar ------------------------------- */

export function createSearch(deviceId: string, city: string, profession: string): SearchRow {
  const now = nowIso();
  const row = db
    .prepare(
      `INSERT INTO searches (id, device_id, city, profession, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(device_id, city, profession) DO UPDATE SET active = 1
       RETURNING *`,
    )
    .get(crypto.randomUUID(), deviceId, city, profession.trim(), now) as unknown as SearchRow;
  return row;
}

export function getSearch(id: string): SearchRow | null {
  return (db.prepare('SELECT * FROM searches WHERE id = ?').get(id) as unknown as SearchRow) ?? null;
}

export function listSearches(deviceId?: string, onlyActive = false): SearchRow[] {
  const conditions: string[] = [];
  const params: string[] = [];
  if (deviceId) {
    conditions.push('device_id = ?');
    params.push(deviceId);
  }
  if (onlyActive) conditions.push('active = 1');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM searches ${where} ORDER BY created_at DESC`)
    .all(...params) as unknown as SearchRow[];
}

export function listSearchesWithCounts(deviceId: string): SearchWithCount[] {
  return db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM search_jobs sj WHERE sj.search_id = s.id) AS match_count,
        (SELECT MAX(sj.first_seen_at) FROM search_jobs sj WHERE sj.search_id = s.id) AS last_match_at,
        (SELECT MAX(sj.notified_at) FROM search_jobs sj WHERE sj.search_id = s.id) AS last_notified_at
       FROM searches s
       WHERE s.device_id = ?
       ORDER BY s.created_at DESC`,
    )
    .all(deviceId) as unknown as SearchWithCount[];
}

export function setSearchActive(id: string, active: boolean): void {
  db.prepare('UPDATE searches SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function deleteSearch(id: string, deviceId: string): boolean {
  const result = db.prepare('DELETE FROM searches WHERE id = ? AND device_id = ?').run(id, deviceId);
  return Number(result.changes) > 0;
}

export function markSearchChecked(id: string): void {
  db.prepare('UPDATE searches SET last_checked_at = ? WHERE id = ?').run(nowIso(), id);
}

/* -------------------------------- ilanlar ------------------------------- */

export function upsertJob(hit: JobHit): string {
  const id = jobIdFor(hit);
  const now = nowIso();
  db.prepare(
    `INSERT INTO jobs (id, source, external_id, title, company, city, district, url, description, posted_at, posted_ago, meta, fingerprint, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       company = COALESCE(excluded.company, jobs.company),
       city = COALESCE(excluded.city, jobs.city),
       district = COALESCE(excluded.district, jobs.district),
       url = excluded.url,
       description = COALESCE(excluded.description, jobs.description),
       posted_at = COALESCE(excluded.posted_at, jobs.posted_at),
       posted_ago = COALESCE(excluded.posted_ago, jobs.posted_ago),
       meta = COALESCE(excluded.meta, jobs.meta),
       last_seen_at = excluded.last_seen_at`,
  ).run(
    id,
    hit.source,
    hit.externalId,
    hit.title,
    hit.company ?? null,
    hit.city ?? null,
    hit.district ?? null,
    hit.url,
    hit.description ?? null,
    hit.postedAt ?? null,
    hit.postedAgo ?? null,
    hit.meta ? JSON.stringify(hit.meta) : null,
    fingerprintFor(hit),
    now,
    now,
  );
  return id;
}

export function getJob(id: string): JobRow | null {
  return (db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as JobRow) ?? null;
}

export function matchExists(searchId: string, jobId: string): boolean {
  return !!db.prepare('SELECT 1 FROM search_jobs WHERE search_id = ? AND job_id = ?').get(searchId, jobId);
}

export function addMatch(searchId: string, jobId: string, notifiedAt: string | null = null): void {
  db.prepare(
    'INSERT OR IGNORE INTO search_jobs (search_id, job_id, first_seen_at, notified_at) VALUES (?, ?, ?, ?)',
  ).run(searchId, jobId, nowIso(), notifiedAt);
}

export function markMatchesNotified(searchId: string, jobIds: string[]): void {
  const at = nowIso();
  const stmt = db.prepare('UPDATE search_jobs SET notified_at = ? WHERE search_id = ? AND job_id = ?');
  for (const jobId of jobIds) stmt.run(at, searchId, jobId);
}

export function countMatches(searchId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM search_jobs WHERE search_id = ?').get(searchId) as unknown as {
    c: number;
  };
  return Number(row?.c ?? 0);
}

export function listRecentJobs(searchId: string, limit = 50): JobRow[] {
  return db
    .prepare(
      `SELECT j.* FROM jobs j
       JOIN search_jobs sj ON sj.job_id = j.id
       WHERE sj.search_id = ?
       ORDER BY j.first_seen_at DESC
       LIMIT ?`,
    )
    .all(searchId, limit) as unknown as JobRow[];
}

/* ------------------------------ bildirimler ----------------------------- */

export function insertNotification(input: {
  deviceId: string;
  searchId?: string | null;
  jobId?: string | null;
  title: string;
  body: string;
}): NotificationRow {
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO notifications (id, device_id, search_id, job_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, input.deviceId, input.searchId ?? null, input.jobId ?? null, input.title, input.body, nowIso());
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as NotificationRow;
}

export function listNotifications(deviceId: string, limit = 50): NotificationRow[] {
  return db
    .prepare('SELECT * FROM notifications WHERE device_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(deviceId, limit) as unknown as NotificationRow[];
}

export function markNotificationsRead(deviceId: string): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE device_id = ? AND read_at IS NULL').run(nowIso(), deviceId);
}

/* -------------------------------- bakım -------------------------------- */

export function pruneOldJobs(days = 30): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = db.prepare('DELETE FROM jobs WHERE last_seen_at < ?').run(cutoff);
  return Number(result.changes);
}

export function getState(key: string): string | null {
  const row = db.prepare('SELECT value FROM source_state WHERE key = ?').get(key) as unknown as { value: string } | undefined;
  return row?.value ?? null;
}

export function setState(key: string, value: string): void {
  db.prepare(
    'INSERT INTO source_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(key, value, nowIso());
}