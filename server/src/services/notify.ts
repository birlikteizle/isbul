import { env } from '../env.js';
import { clearDeviceToken, getDevice, insertNotification, type DeviceRow } from '../db.js';

type MessagingLike = {
  send(message: unknown): Promise<string>;
};

let messaging: MessagingLike | null = null;
let initialized = false;

export function isPushEnabled(): boolean {
  return !!messaging;
}

export async function initPush(log: { info: Function; warn: Function; error: Function }): Promise<boolean> {
  if (initialized) return !!messaging;
  initialized = true;

  const raw = env.firebaseServiceAccount.trim();
  if (!raw) {
    log.warn('FIREBASE_SERVICE_ACCOUNT boş. Push bildirimleri kapalı; bildirimler sadece uygulama içinde görünecek.');
    return false;
  }

  try {
    const mod: any = await import('firebase-admin');
    const admin = mod.default ?? mod;

    let json: Record<string, unknown>;
    if (raw.startsWith('{')) {
      json = JSON.parse(raw);
    } else {
      json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }

    if (!admin.apps?.length) {
      admin.initializeApp({ credential: admin.credential.cert(json) });
    }
    messaging = admin.messaging() as MessagingLike;
    log.info('Firebase push hazır.');
    return true;
  } catch (error) {
    log.error(`Firebase başlatılamadı: ${(error as Error).message}`);
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Cihaza FCM bildirimi gönderir. Uygulama kapalıyken de Android sistem bildirimi olarak görünür.
 */
export async function sendPush(
  device: DeviceRow,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  if (!messaging || !device.push_token) return false;

  try {
    await messaging.send({
      token: device.push_token,
      notification: {
        title: truncate(title, 120),
        body: truncate(body, 240),
      },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: {
          channelId: 'isbul_jobs',
          sound: 'default',
          defaultVibrateTimings: true,
        },
      },
    });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      clearDeviceToken(device.push_token);
    }
    return false;
  }
}

export async function notifyNewJobs(
  search: { id: string; device_id: string; city: string; profession: string },
  jobs: Array<{ id: string; title: string; company?: string | null }>,
): Promise<boolean> {
  if (jobs.length === 0) return false;

  const first = jobs[0];
  const title = `${search.city} · ${search.profession}`;
  const body =
    jobs.length === 1
      ? `${first.title}${first.company ? ` — ${first.company}` : ''}`
      : `${jobs.length} yeni ilan: ${first.title}${first.company ? ` — ${first.company}` : ''}`;

  insertNotification({
    deviceId: search.device_id,
    searchId: search.id,
    jobId: first.id,
    title,
    body,
  });

  const device = getDevice(search.device_id);
  if (!device) return false;

  return sendPush(device, title, body, {
    searchId: search.id,
    kind: 'new-jobs',
    count: String(jobs.length),
    jobId: first.id,
  });
}