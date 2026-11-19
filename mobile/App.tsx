import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, errorText } from './src/api';
import { ErrorBanner } from './src/components';
import { SearchScreen, type Prefill } from './src/screens/SearchScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  DEFAULT_SERVER_URL,
  loadDeviceId,
  loadPushToken,
  loadServerUrl,
  saveDeviceId,
  savePushToken,
  saveServerUrl,
} from './src/storage';
import { theme } from './src/theme';
import type { DeviceRow, Meta, NotificationRow, SearchRow } from './src/types';

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

function AppContent() {
  const insets = useSafeAreaInsets();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [tab, setTab] = useState<Tab>('search');
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  const deviceRef = useRef<string | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const pushRequested = useRef(false);

  const loadSearches = useCallback(
    async (url = serverUrl, id = deviceRef.current) => {
      if (!id) return;
      const data = await api<{ searches: SearchRow[] }>(url, `/api/searches?deviceId=${id}`);
      setSearches(data.searches);
    },
    [serverUrl],
  );

  const loadNotifications = useCallback(
    async (url = serverUrl, id = deviceRef.current) => {
      if (!id) return;
      const data = await api<{ notifications: NotificationRow[] }>(
        url,
        `/api/notifications?deviceId=${id}`,
      );
      setNotifications(data.notifications);
    },
    [serverUrl],
  );

  const setupPush = useCallback(async (url: string, id: string) => {
    if (pushRequested.current) return;
    pushRequested.current = true;

    try {
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
      if (status !== 'granted') {
        setPushError('Bildirim izni verilmedi. Telefon ayarlarından izin verebilirsin.');
        return;
      }

      const token = await Notifications.getDevicePushTokenAsync();
      const value = typeof token.data === 'string' ? token.data : JSON.stringify(token.data);
      pushTokenRef.current = value;
      setPushToken(value);
      await savePushToken(value);

      await api<{ device: DeviceRow }>(url, '/api/devices', {
        method: 'POST',
        body: JSON.stringify({ deviceId: id, pushToken: value, platform: Platform.OS }),
      });
      setPushError(null);
    } catch (err) {
      const message = errorText(err);
      setPushError(
        /Expo Go|not supported|physical device/i.test(message)
          ? 'Push bildirimi için uygulamanın APK sürümü ve google-services.json gerekli.'
          : `Push token alınamadı: ${message}`,
      );
    }
  }, []);

  const connect = useCallback(
    async (url: string, existingId: string | null, token: string | null) => {
      setConnecting(true);
      setError(null);

      try {
        const metaData = await api<Meta>(url, '/api/meta', {}, 15_000);
        setMeta(metaData);
        setConnected(true);

        let id = existingId;
        let device: DeviceRow | null = null;

        try {
          const res = await api<{ device: DeviceRow }>(url, '/api/devices', {
            method: 'POST',
            body: JSON.stringify({
              deviceId: existingId ?? undefined,
              pushToken: token ?? undefined,
              platform: Platform.OS,
            }),
          });
          device = res.device;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            const res = await api<{ device: DeviceRow }>(url, '/api/devices', {
              method: 'POST',
              body: JSON.stringify({ pushToken: token ?? undefined, platform: Platform.OS }),
            });
            device = res.device;
          } else {
            throw err;
          }
        }

        if (device) {
          id = device.id;
          deviceRef.current = id;
          setDeviceId(id);
          await saveDeviceId(id);
        }

        if (id) {
          await Promise.all([loadSearches(url, id), loadNotifications(url, id)]).catch(
            () => undefined,
          );
          await setupPush(url, id);
        }
      } catch (err) {
        setConnected(false);
        setMeta(null);
        setError(errorText(err));
      } finally {
        setConnecting(false);
      }
    },
    [loadNotifications, loadSearches, setupPush],
  );

  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const [url, id, token] = await Promise.all([
        loadServerUrl(),
        loadDeviceId(),
        loadPushToken(),
      ]);
      setServerUrl(url);
      setDeviceId(id);
      deviceRef.current = id;
      setPushToken(token);
      pushTokenRef.current = token;
      await connect(url, id, token);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uygulama öne geldiğinde listeleri tazele
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && connected) {
        void loadSearches().catch(() => undefined);
        void loadNotifications().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [connected, loadNotifications, loadSearches]);

  // Bildirime dokununca bildirimler sekmesine git
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      setTab('notifications');
      void loadNotifications().catch(() => undefined);
    });
    return () => sub.remove();
  }, [loadNotifications]);

  useEffect(() => {
    if (!connected || !deviceId) return;
    if (tab === 'saved') {
      setLoadingList(true);
      void loadSearches()
        .catch(() => undefined)
        .finally(() => setLoadingList(false));
    }
    if (tab === 'notifications') {
      setLoadingList(true);
      void loadNotifications()
        .catch(() => undefined)
        .finally(() => setLoadingList(false));
    }
  }, [tab, connected, deviceId, loadSearches, loadNotifications]);

  async function handleSaveServer(url: string) {
    const normalized = url.replace(/\/+$/, '');
    if (!/^https?:\/\/.+/.test(normalized)) {
      Alert.alert('Geçersiz adres', 'Örnek: http://192.168.1.100:8787');
      return;
    }
    pushRequested.current = false;
    await saveServerUrl(normalized);
    setServerUrl(normalized);
    await connect(normalized, deviceRef.current, pushTokenRef.current);
  }

  async function handleToggleSearch(id: string, active: boolean) {
    setSearches((prev) => prev.map((s) => (s.id === id ? { ...s, active: active ? 1 : 0 } : s)));
    try {
      await api(serverUrl, `/api/searches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deviceId, active }),
      });
    } catch (err) {
      Alert.alert('Güncellenemedi', errorText(err));
      void loadSearches().catch(() => undefined);
    }
  }

  function handleDeleteSearch(id: string) {
    Alert.alert('Aramayı sil', 'Bu arama ve bildirimleri silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await api(serverUrl, `/api/searches/${id}?deviceId=${deviceId}`, { method: 'DELETE' });
              setSearches((prev) => prev.filter((s) => s.id !== id));
            } catch (err) {
              Alert.alert('Silinemedi', errorText(err));
            }
          })();
        },
      },
    ]);
  }

  async function markAllRead() {
    if (!deviceId) return;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    try {
      await api(serverUrl, '/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
    } catch {
      // sessizce geç
    }
  }

  async function handleTestPush() {
    if (!deviceId) return;
    try {
      const res = await api<{ ok: boolean; pushEnabled: boolean }>(
        serverUrl,
        '/api/devices/test-push',
        { method: 'POST', body: JSON.stringify({ deviceId }) },
      );
      Alert.alert(
        res.ok ? 'Gönderildi' : 'Gönderilemedi',
        res.ok
          ? 'Test bildirimi birkaç saniye içinde telefonuna düşecek.'
          : `Sunucuda push kapalı (Firebase anahtarı yok) veya cihaz token’ı geçersiz.\n\nPush altyapısı: ${
              res.pushEnabled ? 'açık' : 'kapalı'
            }`,
      );
    } catch (err) {
      Alert.alert('Hata', errorText(err));
    }
  }

  function openSearch(city: string, profession: string) {
    setPrefill({ city, profession, nonce: Date.now() });
    setTab('search');
  }

  const unread = notifications.filter((n) => !n.read_at).length;

  if (booting) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.logo}>İşBul</Text>
        <Text style={styles.logoSub}>şehir + meslek radarı</Text>
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
              { backgroundColor: connected ? theme.colors.green : theme.colors.red },
            ]}
          />
          <Text
            style={[styles.connText, { color: connected ? theme.colors.green : theme.colors.red }]}
          >
            {connected ? 'bağlı' : 'kopuk'}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.space(5), paddingBottom: 6 }}>
          <ErrorBanner message={error} onRetry={() => void connect(serverUrl, deviceId, pushToken)} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === 'search' ? (
          <SearchScreen
            serverUrl={serverUrl}
            meta={meta}
            deviceId={deviceId}
            prefill={prefill}
            onSaved={() => void loadSearches().catch(() => undefined)}
          />
        ) : null}

        {tab === 'saved' ? (
          <SavedScreen
            searches={searches}
            loading={loadingList}
            onRefresh={() => {
              setLoadingList(true);
              void loadSearches()
                .catch(() => undefined)
                .finally(() => setLoadingList(false));
            }}
            onToggle={handleToggleSearch}
            onDelete={handleDeleteSearch}
            onOpen={openSearch}
          />
        ) : null}

        {tab === 'notifications' ? (
          <NotificationsScreen
            notifications={notifications}
            loading={loadingList}
            onRefresh={() => {
              setLoadingList(true);
              void loadNotifications()
                .catch(() => undefined)
                .finally(() => setLoadingList(false));
            }}
            onMarkAllRead={() => void markAllRead()}
          />
        ) : null}

        {tab === 'settings' ? (
          <SettingsScreen
            serverUrl={serverUrl}
            connected={connected}
            meta={meta}
            deviceId={deviceId}
            pushToken={pushToken}
            pushError={pushError}
            connecting={connecting}
            onSave={(url) => void handleSaveServer(url)}
            onTestPush={() => void handleTestPush()}
          />
        ) : null}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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