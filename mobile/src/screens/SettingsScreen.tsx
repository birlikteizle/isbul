import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Screen, SectionTitle } from '../components';
import { theme } from '../theme';
import type { Meta } from '../types';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const color =
    tone === 'ok'
      ? theme.colors.green
      : tone === 'warn'
        ? theme.colors.accent
        : theme.colors.textMuted;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen({
  serverUrl,
  connected,
  meta,
  deviceId,
  pushToken,
  pushError,
  connecting,
  onSave,
  onTestPush,
}: {
  serverUrl: string;
  connected: boolean;
  meta: Meta | null;
  deviceId: string | null;
  pushToken: string | null;
  pushError: string | null;
  connecting: boolean;
  onSave: (url: string) => void;
  onTestPush: () => void;
}) {
  const [url, setUrl] = useState(serverUrl);

  useEffect(() => setUrl(serverUrl), [serverUrl]);

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={styles.kicker}>AYARLAR</Text>
        <Text style={styles.title}>Bağlantı ve bildirimler</Text>
      </View>

      <Card style={{ gap: theme.space(4) }}>
        <Field
          label="Sunucu adresi"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.100:8787"
          keyboardType="url"
        />
        <Button
          title={connecting ? 'Bağlanıyor…' : 'Kaydet ve bağlan'}
          onPress={() => onSave(url.trim())}
          loading={connecting}
        />
        <View style={styles.statusLine}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connected ? theme.colors.green : theme.colors.red },
            ]}
          />
          <Text style={[styles.statusText, { color: connected ? theme.colors.green : theme.colors.red }]}>
            {connected ? 'Sunucuya bağlı' : 'Sunucuya bağlı değil'}
          </Text>
        </View>
        <Text style={styles.helpSmall}>
          Telefon ve bilgisayar aynı Wi-Fi ağında olmalı. Bilgisayarda `ipconfig` komutundaki IPv4
          adresini ve `:8787` portunu yaz. Örn: http://192.168.1.100:8787
        </Text>
      </Card>

      <SectionTitle>Sunucu durumu</SectionTitle>
      <Card style={{ gap: 2 }}>
        <Row
          label="Servis"
          value={connected ? `Çalışıyor · ${meta?.app ?? 'İşBul'}` : 'Kapalı'}
          tone={connected ? 'ok' : 'warn'}
        />
        <Row
          label="Taranan kaynak"
          value={meta ? `${meta.sources.length} kaynak` : '—'}
        />
        <Row
          label="Tarama aralığı"
          value={meta ? `${Math.round(meta.scanIntervalSeconds / 60)} dakika` : '—'}
        />
        <Row
          label="Push altyapısı"
          value={meta?.pushEnabled ? 'Firebase bağlı' : 'Firebase yapılandırılmadı'}
          tone={meta?.pushEnabled ? 'ok' : 'warn'}
        />
      </Card>

      <SectionTitle>Cihaz</SectionTitle>
      <Card style={{ gap: 2 }}>
        <Row label="Cihaz kimliği" value={deviceId ? `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}` : 'Yok'} />
        <Row
          label="FCM token"
          value={pushToken ? `${pushToken.slice(0, 14)}…` : 'Alınamadı'}
          tone={pushToken ? 'ok' : 'warn'}
        />
        {pushError ? <Text style={styles.pushError}>{pushError}</Text> : null}
        <Button
          title="Test bildirimi gönder"
          variant="ghost"
          onPress={onTestPush}
          disabled={!deviceId}
          style={{ marginTop: 10 }}
        />
      </Card>

      <SectionTitle>Firebase kurulumu (tek seferlik)</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={styles.help}>
          1. Firebase Console’da ücretsiz bir proje aç.{'\n'}
          2. Android uygulaması ekle: paket adı `com.isbul.app`.{'\n'}
          3. `google-services.json` dosyasını `mobile/` klasörüne koy.{'\n'}
          4. Proje ayarları → Service accounts → yeni özel anahtar indir.{'\n'}
          5. Anahtarın içeriğini sunucuda `FIREBASE_SERVICE_ACCOUNT` değişkenine yaz.{'\n'}
          6. Sunucuyu yeniden başlat ve uygulamayı yeniden derle.
        </Text>
        <Text style={styles.helpSmall}>
          Bu adımlar tamamlanmadan arama çalışır; yeni ilanlar uygulama içindeki Bildirimler
          sekmesinde görünür. Firebase yoksa uygulama 15 dakikada bir arka planda sunucuyu kontrol
          eder ve yerel bildirim gösterir.
        </Text>
      </Card>

      <Text style={styles.version}>İşBul 0.1.0 · {serverUrl}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  helpSmall: { color: theme.colors.textDim, fontSize: 10, lineHeight: 16 },
  help: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.textMuted, fontSize: 12 },
  rowValue: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  pushError: { color: theme.colors.accent, fontSize: 11, lineHeight: 16, marginTop: 6 },
  version: { color: theme.colors.textDim, fontSize: 10, textAlign: 'center', marginTop: 4 },
});