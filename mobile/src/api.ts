export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const base = baseUrl.replace(/\/+$/, '');

  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message =
        typeof data === 'object' && data && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Sunucu hatası (${res.status})`;
      throw new ApiError(message, res.status);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiError('Sunucu yanıt vermedi (zaman aşımı).', 408);
    }
    throw new ApiError(
      'Sunucuya ulaşılamadı. Ayarlar bölümünden sunucu adresini kontrol et.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}