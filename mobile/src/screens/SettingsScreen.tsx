import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, SectionTitle } from '../components';
import { theme } from '../theme';
import { timeAgo } from '../utils';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'muted';
}) {
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
  searchesCount,
  notificationsCount,
  lastCheckAt,
  checking,
  backgroundReady,
  permission,
  onCheckNow,
  onRequestPermission,
  onReset,
}: {
  searchesCount: number;
  notificationsCount: number;
  lastCheckAt: string | null;
  checking: boolean;
  backgroundReady: boolean;
  permission: PermissionState;
  onCheckNow: () => void;
  onRequestPermission: () => void;
  onReset: () => void;
}) {
  const permissionText =
    permission === 'granted'
      ? 'Açık'
      : permission === 'denied'
        ? 'Kapalı — izin ver'
        : 'Henüz sorulmadı';

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={styles.kicker}>AYARLAR</Text>
        <Text style={styles.title}>Telefon modu</Text>
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={styles.cardTitle}>Sunucusuz çalışıyor</Text>
        <Text style={styles.help}>
          Arama ve bildirimler tamamen bu telefonda çalışır. Bilgisayar, sunucu, GitHub Actions veya
          Firebase gerekmez. Uygulama kapalıyken Android'in arka plan görevi devreye girer.
        </Text>
      </Card>

      <SectionTitle>Durum</SectionTitle>
      <Card style={{ gap: 2 }}>
        <Row label="Kayıtlı arama" value={`${searchesCount} adet`} tone={searchesCount > 0 ? 'ok' : 'muted'} />
        <Row label="Bildirim geçmişi" value={`${notificationsCount} kayıt`} />
        <Row
          label="Bildirim izni"
          value={permissionText}
          tone={permission === 'granted' ? 'ok' : 'warn'}
        />
        <Row
          label="Arka plan kontrolü"
          value={backgroundReady ? 'Açık (15 dk)' : 'Kapalı / kısıtlı'}
          tone={backgroundReady ? 'ok' : 'warn'}
        />
        <Row
          label="Son kontrol"
          value={lastCheckAt ? timeAgo(lastCheckAt) : 'Henüz yok'}
        />
      </Card>

      <View style={{ gap: 8 }}>
        {permission !== 'granted' ? (
          <Button title="Bildirim izni ver" onPress={onRequestPermission} />
        ) : null}
        <Button
          title={checking ? 'Kontrol ediliyor…' : 'Şimdi kontrol et'}
          variant="ghost"
          onPress={onCheckNow}
          loading={checking}
          disabled={searchesCount === 0}
        />
      </View>

      <SectionTitle>Nasıl çalışır?</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Text style={styles.help}>
          1. Ara sekmesinde şehir + meslek ara ve kaydet.{'\n'}
          2. Kaydederken o anki ilanlar “görüldü” kabul edilir; eski ilanlar için bildirim gelmez.{'\n'}
          3. Android, uygulama kapalıyken yaklaşık 15 dakikada bir arka plan kontrolü çalıştırır.{'\n'}
          4. Yeni ilan varsa bildirim panelinde gösterilir ve Bildirimler sekmesine eklenir.{'\n'}
          5. Kontrol aralığını Android pil tasarrufu nedeniyle uzatabilir; İşBul'u pil optimizasyonundan
          muaf tutarsan daha düzenli çalışır.
        </Text>
      </Card>

      <SectionTitle>Kaynaklar</SectionTitle>
      <Card style={{ gap: 6 }}>
        <Text style={styles.help}>
          Kariyer.net · Eleman.net · İŞKUR · Kariyer Kapısı · Google News · Instagram · Facebook
        </Text>
        <Text style={styles.helpDim}>
          Derin arama Google News ve DuckDuckGo + Brave üzerinden yapılır. İŞKUR bazı mobil
          operatörlerde site koruması nedeniyle yanıt vermeyebilir. SecretCV'nin bot koruması
          nedeniyle kullanılmıyor.
        </Text>
      </Card>

      <SectionTitle>Veriler</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Text style={styles.helpDim}>
          Kayıtlı aramalar, görülen ilan kimlikleri ve bildirimler yalnızca bu telefonda saklanır.
          Uygulamayı silmek tüm verileri siler.
        </Text>
        <Button
          title="Tüm verileri sıfırla"
          variant="danger"
          onPress={() =>
            Alert.alert('Emin misin?', 'Tüm kayıtlı aramalar ve bildirimler silinecek.', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Sıfırla', style: 'destructive', onPress: onReset },
            ])
          }
        />
      </Card>

      <Text style={styles.version}>İşBul 0.3.0 · derin arama + tarih filtresi</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  help: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 21 },
  helpDim: { color: theme.colors.textDim, fontSize: 11, lineHeight: 17 },
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
  version: { color: theme.colors.textDim, fontSize: 10, textAlign: 'center', marginTop: 4 },
});