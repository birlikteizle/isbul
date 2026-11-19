const UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export interface FetchResult {
  status: number;
  ok: boolean;
  text: string;
  url: string;
}

/**
 * Telefon üzerinden ilan sitelerine istek. Tarayıcı CORS kuralları native uygulamada geçerli değildir.
 */
export async function fetchText(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const headers = {
    'user-agent': UA,
    'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...(options.headers ?? {}),
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: controller.signal });
      } catch {
        // Bazı Android sürümlerinde user-agent başlığı reddedilebilir; başlıksız tekrar dene.
        res = await fetch(url, { signal: controller.signal });
      }
      const text = await res.text();

      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt === 0) {
        lastError = new Error(`HTTP ${res.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1_800));
        continue;
      }

      return { status: res.status, ok: res.ok, text, url: res.url || url };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1_200));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const NAMED: Record<string, string> = {
  amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ',
  ccedil: 'ç', Ccedil: 'Ç', gbreve: 'ğ', Gbreve: 'Ğ', imath: 'ı', Idot: 'İ',
  ouml: 'ö', Ouml: 'Ö', scedil: 'ş', Scedil: 'Ş', uuml: 'ü', Uuml: 'Ü',
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED[name] ?? match);
}

export function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

export function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}