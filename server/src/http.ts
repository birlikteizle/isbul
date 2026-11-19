import dns from 'node:dns';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Bazı devlet siteleri IPv6'da yanıt vermiyor; IPv4'ü önceliklendir.
dns.setDefaultResultOrder('ipv4first');

const execFileAsync = promisify(execFile);

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export interface FetchResult {
  status: number;
  ok: boolean;
  text: string;
  url: string;
}

const lastHitByHost = new Map<string, number>();
const inflight = new Map<string, Promise<FetchResult>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(host: string, gapMs: number): Promise<void> {
  const last = lastHitByHost.get(host) ?? 0;
  const wait = last + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastHitByHost.set(host, Date.now());
}

/**
 * Kibar HTTP istemcisi: aynı host'a çok sık istek atmaz, aynı URL'yi eşzamanlı tekilleştirir,
 * kısa süreli hatalarda bir kez tekrar dener.
 */
export async function fetchText(
  url: string,
  options: RequestInit & { timeoutMs?: number; minGapMs?: number } = {},
): Promise<FetchResult> {
  const { timeoutMs = 25_000, minGapMs = 1_100, ...init } = options;
  const host = new URL(url).host;
  const key = `${init.method ?? 'GET'} ${url}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const run = async (): Promise<FetchResult> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await throttle(host, minGapMs);
        const res = await fetch(url, {
          ...init,
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            'user-agent': DEFAULT_UA,
            'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
            ...(init.headers ?? {}),
          },
        });
        const text = await res.text();
        if (res.status >= 500 && attempt === 0) {
          lastError = new Error(`HTTP ${res.status}`);
          await sleep(700);
          continue;
        }
        return { status: res.status, ok: res.ok, text, url: res.url || url };
      } catch (error) {
        lastError = error;
        if (attempt === 0) await sleep(700);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Node fetch'in WAF tarafından reddedildiği siteler için curl yedeği (İŞKUR). */
export async function curlText(url: string, options: { timeoutMs?: number } = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const marker = '\n__ISBUL_STATUS__';
  const args = [
    '-sS',
    '-L',
    '--compressed',
    '--max-time',
    String(Math.ceil(timeoutMs / 1000)),
    '-A',
    DEFAULT_UA,
    '-H',
    'accept-language: tr-TR,tr;q=0.9,en;q=0.7',
    '-H',
    'accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-w',
    `${marker}%{http_code}`,
    url,
  ];

  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 25 * 1024 * 1024,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs + 5_000,
  });

  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error('curl yanıtı okunamadı');
  const text = stdout.slice(0, markerIndex);
  const status = Number(stdout.slice(markerIndex + marker.length).trim());
  return { status, ok: status >= 200 && status < 300, text, url };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  quot: '"',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ccedil: 'ç',
  Ccedil: 'Ç',
  gbreve: 'ğ',
  Gbreve: 'Ğ',
  imath: 'ı',
  Idot: 'İ',
  ouml: 'ö',
  Ouml: 'Ö',
  scedil: 'ş',
  Scedil: 'Ş',
  uuml: 'ü',
  Uuml: 'Ü',
  ordf: 'ª',
  deg: '°',
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name] ?? match);
}

export function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}