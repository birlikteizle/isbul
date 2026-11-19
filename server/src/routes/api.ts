import type { FastifyInstance, FastifyReply } from 'fastify';
import { env } from '../env.js';
import { CITIES, findCity } from '../cities.js';
import {
  addMatch,
  countMatches,
  createDevice,
  createSearch,
  deleteSearch,
  getDevice,
  getJob,
  getSearch,
  insertNotification,
  listNotifications,
  listSearchesWithCounts,
  markNotificationsRead,
  markSearchChecked,
  setSearchActive,
  updateDeviceToken,
} from '../db.js';
import { runSearch, SearchError } from '../services/search.js';
import { scanAll } from '../services/scheduler.js';
import { isPushEnabled, sendPush } from '../services/notify.js';
import { SOURCE_LABELS } from '../sources/index.js';

function bad(reply: FastifyReply, message: string, status = 400) {
  return reply.code(status).send({ error: message });
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, at: new Date().toISOString() }));

  app.get('/api/meta', async () => ({
    app: 'İşBul',
    version: '0.1.0',
    cities: CITIES.map((city) => ({ name: city.name, plate: city.plate })),
    sources: Object.entries(SOURCE_LABELS).map(([source, label]) => ({ source, label })),
    pushEnabled: isPushEnabled(),
    scanIntervalSeconds: Math.round(env.scanIntervalMs / 1000),
  }));

  /* ------------------------------- cihazlar ------------------------------- */

  app.post('/api/devices', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const deviceId = str(body.deviceId);
    const pushToken = str(body.pushToken);
    const platform = str(body.platform) || 'android';

    if (deviceId) {
      const existing = getDevice(deviceId);
      if (!existing) return bad(reply, 'Cihaz bulunamadı', 404);
      if (pushToken) updateDeviceToken(deviceId, pushToken);
      return { device: getDevice(deviceId) };
    }

    const device = createDevice(pushToken || null, platform);
    return { device };
  });

  /* -------------------------------- arama --------------------------------- */

  app.get('/api/jobs', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const city = str(query.city);
    const profession = str(query.q ?? query.profession);
    if (!city) return bad(reply, 'city parametresi gerekli');
    if (!profession) return bad(reply, 'q (meslek) parametresi gerekli');

    try {
      const result = await runSearch(
        { city, profession },
        { fresh: query.fresh === '1' || query.fresh === 'true', persist: true },
      );
      return result;
    } catch (error) {
      return bad(reply, (error as Error).message, (error as SearchError).statusCode ?? 500);
    }
  });

  app.get('/api/jobs/:id', async (request, reply) => {
    const job = getJob((request.params as { id: string }).id);
    if (!job) return bad(reply, 'İlan bulunamadı', 404);
    return {
      ...job,
      meta: job.meta ? JSON.parse(job.meta) : null,
    };
  });

  /* ------------------------------ kayıtlı aramalar ------------------------ */

  app.get('/api/searches', async (request, reply) => {
    const deviceId = str((request.query as Record<string, string>).deviceId);
    if (!deviceId) return bad(reply, 'deviceId gerekli');
    if (!getDevice(deviceId)) return bad(reply, 'Cihaz bulunamadı', 404);
    return { searches: listSearchesWithCounts(deviceId) };
  });

  app.post('/api/searches', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const deviceId = str(body.deviceId);
    const cityInput = str(body.city);
    const profession = str(body.profession);

    if (!deviceId) return bad(reply, 'deviceId gerekli');
    if (!getDevice(deviceId)) return bad(reply, 'Cihaz bulunamadı', 404);
    if (!profession) return bad(reply, 'Meslek gerekli');

    const city = findCity(cityInput);
    if (!city) return bad(reply, `Şehir bulunamadı: ${cityInput}. Örn: Gaziantep`);

    const search = createSearch(deviceId, city.name, profession);
    const existingCount = countMatches(search.id);

    if (existingCount > 0) {
      markSearchChecked(search.id);
      return { search, baselineCount: existingCount, baselined: false };
    }

    // Yeni kayıtta mevcut ilanları "görüldü" olarak işaretle; sadece sonrakiler bildirilsin.
    let baselineCount = 0;
    let sources: unknown[] = [];
    try {
      const result = await runSearch({ city: city.name, profession }, { fresh: false, persist: true });
      baselineCount = result.items.length;
      sources = result.sources;
      for (const item of result.items) {
        if (item.id) addMatch(search.id, item.id, new Date().toISOString());
      }
    } catch (error) {
      return bad(reply, `Arama kaydedildi ama ilk tarama başarısız: ${(error as Error).message}`, 502);
    }

    markSearchChecked(search.id);
    return {
      search: { ...search, match_count: baselineCount },
      baselineCount,
      baselined: true,
      sources,
      message:
        baselineCount > 0
          ? `Şu an ${baselineCount} ilan bulundu. Yeni ilanlar için bildirim açık.`
          : 'Arama kaydedildi. Yeni ilan bulununca bildirim gönderilecek.',
    };
  });

  app.patch('/api/searches/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const search = getSearch(id);
    if (!search) return bad(reply, 'Arama bulunamadı', 404);
    if (body.deviceId && str(body.deviceId) !== search.device_id) return bad(reply, 'Yetkisiz', 403);
    if (typeof body.active === 'boolean') setSearchActive(id, body.active);
    return { search: getSearch(id) };
  });

  app.delete('/api/searches/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const deviceId = str((request.query as Record<string, string>).deviceId);
    if (!deviceId) return bad(reply, 'deviceId gerekli');
    if (!deleteSearch(id, deviceId)) return bad(reply, 'Arama bulunamadı', 404);
    return { ok: true };
  });

  /* ------------------------------ bildirimler ----------------------------- */

  app.get('/api/notifications', async (request, reply) => {
    const deviceId = str((request.query as Record<string, string>).deviceId);
    if (!deviceId) return bad(reply, 'deviceId gerekli');
    return { notifications: listNotifications(deviceId) };
  });

  app.post('/api/notifications/read', async (request, reply) => {
    const deviceId = str((request.body as Record<string, unknown>)?.deviceId);
    if (!deviceId) return bad(reply, 'deviceId gerekli');
    markNotificationsRead(deviceId);
    return { ok: true };
  });

  /* -------------------------------- test push ----------------------------- */

  app.post('/api/devices/test-push', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const deviceId = str(body.deviceId);
    const device = deviceId ? getDevice(deviceId) : null;
    if (!device) return bad(reply, 'Cihaz bulunamadı', 404);

    if (!device.push_token) {
      return bad(reply, 'Bu cihazda push token yok. FCM yapılandırması gerekiyor.', 400);
    }

    const ok = await sendPush(device, 'İşBul test bildirimi', 'Bildirimler çalışıyor 🎯', {
      kind: 'test',
    });
    insertNotification({
      deviceId: device.id,
      title: 'İşBul test bildirimi',
      body: 'Bildirimler çalışıyor 🎯',
    });
    return { ok, pushEnabled: isPushEnabled() };
  });

  /* -------------------------------- tarama -------------------------------- */

  app.post('/api/scan', async (request, reply) => {
    if (env.scanToken) {
      const token = request.headers['x-scan-token'];
      if (typeof token !== 'string' || token !== env.scanToken) return bad(reply, 'Yetkisiz', 403);
    }
    const summary = await scanAll(request.log);
    return summary;
  });
}