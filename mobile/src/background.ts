import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { loadDeviceId, loadPushToken, loadServerUrl } from './storage';
import type { Meta, NotificationRow } from './types';

export const BACKGROUND_TASK_NAME = 'isbul-notification-check';
const LAST_SEEN_KEY = 'isbul.lastNotificationAt';

/**
 * Firebase yapılandırılmadıysa uygulama kapalıyken bile 15 dakikada bir sunucuyu kontrol eder
 * ve yeni bildirimleri yerel Android bildirimi olarak gösterir.
 */
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const [serverUrl, deviceId, token] = await Promise.all([
      loadServerUrl(),
      loadDeviceId(),
      loadPushToken(),
    ]);
    if (!deviceId) return BackgroundTask.BackgroundTaskResult.Success;

    const meta = await api<Meta>(serverUrl, '/api/meta', {}, 15_000);

    // FCM hazırsa push zaten geliyor; çift bildirim gönderme.
    if (meta.pushEnabled && token) return BackgroundTask.BackgroundTaskResult.Success;

    const data = await api<{ notifications: NotificationRow[] }>(
      serverUrl,
      `/api/notifications?deviceId=${deviceId}`,
      {},
      20_000,
    );

    const items = data.notifications ?? [];
    const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
    const lastTime = lastSeen ? Date.parse(lastSeen) : 0;

    const fresh = items
      .filter((item) => {
        const time = Date.parse(item.created_at);
        return Number.isFinite(time) && time > lastTime;
      })
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    if (!lastSeen) {
      if (items[0]) await AsyncStorage.setItem(LAST_SEEN_KEY, items[0].created_at);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    for (const item of fresh.slice(-5)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body: item.body,
          sound: 'default',
          data: { notificationId: item.id },
        },
        trigger: null,
      });
    }

    if (fresh.length > 0) {
      await AsyncStorage.setItem(LAST_SEEN_KEY, fresh[fresh.length - 1].created_at);
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;

    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, { minimumInterval: 15 });
    }
    return true;
  } catch {
    return false;
  }
}