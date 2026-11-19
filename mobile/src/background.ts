import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { runLocalSearch } from './local/search';
import { applyCheckResults, loadLocalState, setLastCheck, type CheckResult } from './local/store';

export const BACKGROUND_TASK_NAME = 'isbul-local-check';
const LEGACY_TASK_NAME = 'isbul-notification-check';

export interface LocalCheckSummary {
  ok: boolean;
  newCount: number;
  checked: number;
  skipped: boolean;
  errors: string[];
}

async function performCheck(scheduleNotifications: boolean): Promise<LocalCheckSummary> {
  const state = await loadLocalState();
  const active = state.searches.filter((search) => search.active === 1).slice(0, 3);

  if (active.length === 0) {
    return { ok: true, newCount: 0, checked: 0, skipped: true, errors: [] };
  }

  const results: CheckResult[] = [];
  const errors: string[] = [];

  for (const [index, search] of active.entries()) {
    try {
      const response = await runLocalSearch(search.city, search.profession, {
        fresh: true,
        range: 'all',
        // Sosyal medya arama motorları hız sınırına takılmasın diye her turda yalnızca ilk arama.
        skipSocial: index > 0,
      });
      results.push({
        searchId: search.id,
        items: response.items.map((item) => ({
          id: item.id,
          title: item.title,
          company: item.company,
        })),
      });
    } catch (error) {
      errors.push(`${search.city} / ${search.profession}: ${(error as Error).message}`);
    }

    // Siteleri art arda yormamak için aramalar arasında kısa bir nefes bırak.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  const applied = await applyCheckResults(results);

  if (scheduleNotifications) {
    for (const notification of applied.notifications) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notification.title,
            body: notification.body,
            sound: 'default',
            data: { notificationId: notification.id, searchId: notification.search_id },
          },
          trigger: null,
        });
      } catch {
        // Bildirim izni yoksa sessizce devam et; kayıt uygulama içinde duruyor.
      }
    }
  }

  await setLastCheck(new Date().toISOString());

  return {
    ok: errors.length < active.length,
    newCount: applied.notifications.length,
    checked: results.length,
    skipped: false,
    errors,
  };
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const summary = await performCheck(true);
    return summary.ok
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Ayarlar ekranındaki "Şimdi kontrol et" ve ilk kurulum için. */
export function runLocalCheckNow(): Promise<LocalCheckSummary> {
  return performCheck(true);
}

export async function registerBackgroundTask(): Promise<boolean> {
  try {
    // Eski sunucu tabanlı görevi temizle.
    try {
      if (await TaskManager.isTaskRegisteredAsync(LEGACY_TASK_NAME)) {
        await BackgroundTask.unregisterTaskAsync(LEGACY_TASK_NAME);
      }
    } catch {
      // yoksay
    }

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

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    }
  } catch {
    // yoksay
  }
}