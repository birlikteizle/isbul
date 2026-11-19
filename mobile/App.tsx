import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { registerBackgroundTask, runLocalCheckNow } from './src/background';
import { runLocalSearch } from './src/local/search';
import { loadLocalState, localActions, type LocalSearch } from './src/local/store';
import { ErrorBanner } from './src/components';
import { SearchScreen, type Prefill, type SaveResult } from './src/screens/SearchScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SettingsScreen, type PermissionState } from './src/screens/SettingsScreen';
import { theme } from './src/theme';
import type { NotificationRow } from './src/types';

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowAlert: true,
    }) as any,
});

type Tab = 'search' | 'saved' | 'notifications' | 'settings';

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'search', label: 'Ara', icon: '🔎' },
  { key: 'saved', label: 'Kayıtlı', icon: '📌' },
  { key: 'notifications', label: 'Bildirim', icon: '🔔' },
  { key: 'settings', label: 'Ayarlar', icon: '⚙️' },
];

export default function App() {
  const [searches, setSearches] = useState<LocalSearch[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('search');
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [checking, setChecking] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  const refreshState = useCallback(async () => {
    const state = await loadLocalState();
    setSearches(state.searches);
    setNotifications(state.notifications);
    setLastCheckAt(state.last_check_at);
  }, []);

  async function setupNotifications() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('isbul_jobs', {
        name: 'Yeni iş ilanları',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 180, 250],
        lightColor: '#F5A524',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    setPermission(status as PermissionState);
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        await setupNotifications();
        const background = await registerBackgroundTask();
        setBackgroundReady(background);
        await refreshState();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshState]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshState();
    });
    return () => sub.remove();
  }, [refreshState]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      setTab('notifications');
      void refreshState();
    });
    return () => sub.remove();
  }, [refreshState]);

  useEffect(() => {
    if (tab === 'saved' || tab === 'notifications') void refreshState();
  }, [tab, refreshState]);

  async function handleSave(city: string, profession: string, ids: string[]): Promise<SaveResult> {
    const before = (await loadLocalState()).searches.find(
      (search) => search.city === city && search.profession === profession,
    );
    await localActions.addSearch(city, profession, ids);
    await refreshState();

    return {
      count: ids.length,
      message: before
        ? 'Bu arama zaten kayıtlı. Yeni ilanlar için kontrol açık.'
        : ids.length > 0
          ? `Şu an ${ids.length} ilan görüldü olarak işaretlendi. Yeni ilanlar için kontrol açık.`
          : 'Arama kaydedildi. Yeni ilan bulununca bildirim gönderilecek.',
    };
  }

  async function handleToggle(id: string, active: boolean) {
    await localActions.setActive(id, active);
    await refreshState();
  }

  function handleDelete(id: string) {
    Alert.alert('Aramayı sil', 'Bu arama ve görülen ilan kayıtları silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await localActions.removeSearch(id);
            await refreshState();
          })();
        },
      },
    ]);
  }

  async function handleCheckNow() {
    if (searches.length === 0) {
      Alert.alert('Kayıtlı arama yok', 'Önce Ara sekmesinden bir şehir + meslek kaydet.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const summary = await runLocalCheckNow();
      await refreshState();
      if (summary.skipped) {
        Alert.alert('Kontrol atlandı', 'Aktif kayıtlı arama bulunamadı.');
      } else if (summary.errors.length > 0 && summary.checked === 0) {
        Alert.alert('Kontrol başarısız', summary.errors.join('\n'));
      } else {
        Alert.alert(
          summary.newCount > 0 ? `${summary.newCount} yeni ilan` : 'Yeni ilan yok',
          summary.newCount > 0
            ? 'Bildirimler sekmesine eklendi.'
            : `${summary.checked} arama kontrol edildi.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  async function requestPermission() {
    const perms = await Notifications.requestPermissionsAsync();
    setPermission(perms.status as PermissionState);
    if (perms.status !== 'granted') {
      Alert.alert(
        'Bildirim izni kapalı',
        'Telefon ayarlarından İşBul bildirimlerine izin vermen gerekiyor.',
        [
          { text: 'Kapat', style: 'cancel' },
          { text: 'Ayarları aç', onPress: () => void Linking.openSettings() },
        ],
      );
    }
  }

  async function handleReset() {
    await localActions.reset();
    await refreshState();
  }

  function openSearch(city: string, profession: string) {
    setPrefill({ city, profession, nonce: Date.now() });
    setTab('search');
  }

  const unread = notifications.filter((notification) => !notification.read_at).length;

  if (booting) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.logo}>İşBul</Text>
        <Text style={styles.logoSub}>telefonda çalışan radar</Text>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>
            İş<Text style={{ color: theme.colors.accent }}>Bul</Text>
          </Text>
          <Text style={styles.brandSub}>şehir + meslek radarı</Text>
        </View>
        <Pressable onPress={() => setTab('settings')} style={styles.connBadge}>
          <View
            style={[
              styles.connDot,
              { backgroundColor: backgroundReady ? theme.colors.green : theme.colors.accent },
            ]}
          />
          <Text
            style={[
              styles.connText,
              { color: backgroundReady ? theme.colors.green : theme.colors.accent },
            ]}
          >
            {backgroundReady ? 'sunucusuz' : 'kısıtlı'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.space(5), paddingBottom: 6 }}>
          <ErrorBanner message={error} onRetry={() => void refreshState()} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === 'search' ? (
          <SearchScreen
            prefill={prefill}
            onSearch={(city, profession, range) => runLocalSearch(city, profession, { range })}
            onSave={handleSave}
          />
        ) : null}

        {tab === 'saved' ? (
          <SavedScreen
            searches={searches}
            loading={false}
            onRefresh={() => void refreshState()}
            onToggle={(id, active) => void handleToggle(id, active)}
            onDelete={handleDelete}
            onOpen={openSearch}
          />
        ) : null}

        {tab === 'notifications' ? (
          <NotificationsScreen
            notifications={notifications}
            loading={false}
            onRefresh={() => void refreshState()}
            onMarkAllRead={() => {
              void (async () => {
                await localActions.markAllRead();
                await refreshState();
              })();
            }}
          />
        ) : null}

        {tab === 'settings' ? (
          <SettingsScreen
            searchesCount={searches.filter((search) => search.active === 1).length}
            notificationsCount={notifications.length}
            lastCheckAt={lastCheckAt}
            checking={checking}
            backgroundReady={backgroundReady}
            permission={permission}
            onCheckNow={() => void handleCheckNow()}
            onRequestPermission={() => void requestPermission()}
            onReset={() => void handleReset()}
          />
        ) : null}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.6 }]}
            >
              <View>
                <Text style={[styles.tabIcon, active && { opacity: 1 }]}>{item.icon}</Text>
                {item.key === 'notifications' && unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, active && { color: theme.colors.accent }]}>
                {item.label}
              </Text>
              <View
                style={[styles.tabIndicator, active && { backgroundColor: theme.colors.accent }]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  splash: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { color: theme.colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  logoSub: { color: theme.colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space(5),
    paddingTop: theme.space(2),
    paddingBottom: theme.space(3),
  },
  brand: { color: theme.colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  brandSub: { color: theme.colors.textDim, fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  connText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 18, opacity: 0.55 },
  tabLabel: { color: theme.colors.textDim, fontSize: 10, fontWeight: '700' },
  tabIndicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});