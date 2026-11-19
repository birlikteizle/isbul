import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  serverUrl: 'isbul.serverUrl',
  deviceId: 'isbul.deviceId',
  pushToken: 'isbul.pushToken',
} as const;

export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.100:8787';

export async function loadServerUrl(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.serverUrl)) ?? DEFAULT_SERVER_URL;
}

export async function saveServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.serverUrl, url.trim());
}

export async function loadDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.deviceId);
}

export async function saveDeviceId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.deviceId, id);
}

export async function loadPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.pushToken);
}

export async function savePushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.pushToken, token);
}

export async function clearDevice(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.deviceId, KEYS.pushToken]);
}