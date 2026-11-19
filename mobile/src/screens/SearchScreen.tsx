import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api, errorText } from '../api';
import { Button, Card, CityPicker, EmptyState, ErrorBanner, Field, Pill, Screen, SectionTitle } from '../components';
import { sourceLabels, theme } from '../theme';
import type { Meta, SearchResponse } from '../types';
import { formatDuration, timeAgo } from '../utils';

export interface Prefill {
  city: string;
  profession: string;
  nonce: number;
}

export function SearchScreen({
  serverUrl,
  meta,
  deviceId,
  prefill,
  onSaved,
}: {
  serverUrl: string;
  meta: Meta | null;
  deviceId: string | null;
  prefill: Prefill | null;
  onSaved: () => void;
}) {
  const [city, setCity] = useState(prefill?.city ?? 'Gaziantep');
  const [profession, setProfession] = useState(prefill?.profession ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setCity(prefill.city);
    setProfession(prefill.profession);
  }, [prefill?.nonce]);

  async function runSearch(fresh: boolean) {
    const trimmed = profession.trim();
    if (!city.trim()) {
      setError('Önce bir şehir seç.');
      return;
    }
    if (trimmed.length < 2) {
      setError('Mesleği yaz (en az 2 harf). Örn: aşçı, satış, kaynakçı');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api<SearchResponse>(
        serverUrl,
        `/api/jobs?city=${encodeURIComponent(city)}&q=${encodeURIComponent(trimmed)}&fresh=${fresh ? 1 : 0}`,
        {},
        120_000,
      );
      setResult(data);
    } catch (err) {
      setError(errorText(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveSearch() {
    if (!deviceId) {
      Alert.alert('Cihaz kaydı yok', 'Ayarlar bölümünden sunucuya bağlanmayı dene.');
      return;
    }
    if (!result) {
      Alert.alert('Önce arama yap', 'Kaydetmek için önce sonuçları getir.');
      return;
    }

    setSaving(true);
    try {
      const data = await api<{ baselineCount: number; message: string }>(
        serverUrl,
        '/api/searches',
        {
          method: 'POST',
          body: JSON.stringify({ deviceId, city: result.city, profession: result.profession }),
        },
        120_000,
      );
      Alert.alert('Arama kaydedildi', data.message);
      onSaved();
    } catch (err) {
      Alert.alert('Kaydedilemedi', errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const failedSources = result?.sources.filter((s) => s.warning && !s.ok) ?? [];
  const isEmpty = result && result.items.length === 0;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>ŞEHİR + MESLEK RADARI</Text>
        <Text style={styles.heroTitle}>Yeni ilanı{'\n'}sen bulma, biz bulalım.</Text>
        <Text style={styles.heroBody}>
          Kariyer.net, Eleman.net, İŞKUR, Kariyer Kapısı ve daha fazlasında tara.
        </Text>
      </View>

      <Card style={{ gap: theme.space(4) }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Şehir</Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.selector, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.selectorIcon}>📍</Text>
            <Text style={[styles.selectorText, !city && { color: theme.colors.textDim }]}>
              {city || 'Şehir seç'}
            </Text>
            <Text style={styles.selectorChevron}>⌄</Text>
          </Pressable>
        </View>

        <Field
          label="Meslek"
          value={profession}
          onChangeText={setProfession}
          placeholder="Örn: aşçı, satış danışmanı, kaynakçı"
          autoCapitalize="none"
          onSubmitEditing={() => void runSearch(false)}
        />

        <Button
          title={loading ? 'Kaynaklar taranıyor…' : 'İlanları ara'}
          onPress={() => void runSearch(false)}
          loading={loading}
        />
        <Text style={styles.hint}>
          İlk arama 5-20 saniye sürebilir. Aynı aramayı tekrar yapınca sonuçlar önbellekten gelir.
        </Text>
      </Card>

      {error ? <ErrorBanner message={error} onRetry={() => void runSearch(false)} /> : null}

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Siteler taranıyor, ilanlar tekilleştiriliyor…</Text>
        </View>
      ) : null}

      {result ? (
        <>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.resultTitle}>
                {result.items.length} ilan · {result.city}
              </Text>
              <Text style={styles.resultMeta}>
                “{result.profession}” · {formatDuration(result.tookMs)}
                {result.cached ? ' · önbellek' : ''}
              </Text>
            </View>
            <Pressable onPress={() => void runSearch(true)} hitSlop={10}>
              <Text style={styles.refresh}>Yenile ↻</Text>
            </Pressable>
          </View>

          <View style={styles.sourceRow}>
            {result.sources.map((source) => (
              <Pill
                key={source.source}
                label={`${source.label} ${source.count}`}
                color={theme.sourceColors[source.source] ?? theme.colors.blue}
                subtle={source.count === 0}
              />
            ))}
          </View>

          {failedSources.length > 0 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Bazı kaynaklar yanıt vermedi</Text>
              {failedSources.map((source) => (
                <Text key={source.source} style={styles.warnText}>
                  • {source.label}: {source.warning}
                </Text>
              ))}
            </View>
          ) : null}

          <Button
            title={saving ? 'Kaydediliyor…' : 'Bu aramayı kaydet ve bildirim al'}
            variant="ghost"
            onPress={() => void saveSearch()}
            loading={saving}
          />

          {isEmpty ? (
            <EmptyState
              icon="🔍"
              title="Şu an ilan yok"
              body="Bu şehir ve meslek için ilan bulunamadı. Yine de kaydedebilirsin; yeni ilan çıkınca bildirim gelir."
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              {result.items.map((item) => {
                const iskurCount = Number(item.meta?.count ?? 0);
                return (
                  <Card
                    key={item.id || `${item.source}-${item.title}-${item.company}`}
                    onPress={() => void WebBrowser.openBrowserAsync(item.url)}
                    style={{ gap: 8 }}
                  >
                    <View style={styles.cardTop}>
                      <Pill
                        label={sourceLabels[item.source] ?? item.source}
                        color={theme.sourceColors[item.source] ?? theme.colors.blue}
                      />
                      {iskurCount > 0 ? (
                        <Pill label={`${iskurCount} açık iş`} color={theme.colors.accent} />
                      ) : null}
                      {item.postedAgo ? (
                        <Text style={styles.ago}>{item.postedAgo}</Text>
                      ) : item.postedAt ? (
                        <Text style={styles.ago}>{timeAgo(item.postedAt)}</Text>
                      ) : null}
                    </View>

                    <Text style={styles.jobTitle} numberOfLines={2}>
                      {item.title}
                    </Text>

                    <Text style={styles.jobMeta} numberOfLines={1}>
                      {[item.company, item.city, item.district].filter(Boolean).join(' · ')}
                    </Text>

                    {item.description ? (
                      <Text style={styles.jobDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}

                    <Text style={styles.open} numberOfLines={1}>
                      İlana git ↗
                    </Text>
                  </Card>
                );
              })}
            </View>
          )}

          <Text style={styles.disclaimer}>
            İŞKUR sonuçları meslek bazında “açık iş sayısı”dır; bireysel ilan kaydı değildir. Diğer
            sonuçlar orijinal siteye yönlendirir.
          </Text>
        </>
      ) : null}

      <CityPicker
        visible={pickerOpen}
        cities={meta?.cities ?? []}
        selected={city}
        onSelect={setCity}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: theme.space(2), paddingBottom: theme.space(2), gap: 8 },
  heroKicker: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: { color: theme.colors.text, fontSize: 30, fontWeight: '900', lineHeight: 35 },
  heroBody: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorIcon: { fontSize: 16 },
  selectorText: { flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  selectorChevron: { color: theme.colors.textDim, fontSize: 18 },
  hint: { color: theme.colors.textDim, fontSize: 11, lineHeight: 16 },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: theme.space(5),
    paddingHorizontal: theme.space(4),
  },
  loadingText: { color: theme.colors.textMuted, fontSize: 13, flex: 1 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  resultTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  resultMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 3 },
  refresh: { color: theme.colors.accent, fontWeight: '700', fontSize: 13 },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  warnBox: {
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: `${theme.colors.accent}44`,
    borderRadius: theme.radius.md,
    padding: theme.space(3),
    gap: 4,
  },
  warnTitle: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
  warnText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ago: { color: theme.colors.textDim, fontSize: 11, marginLeft: 'auto' },
  jobTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', lineHeight: 21 },
  jobMeta: { color: theme.colors.textMuted, fontSize: 12 },
  jobDesc: { color: theme.colors.textDim, fontSize: 12, lineHeight: 17 },
  open: { color: theme.colors.blue, fontSize: 12, fontWeight: '700', marginTop: 2 },
  disclaimer: { color: theme.colors.textDim, fontSize: 10, lineHeight: 15, paddingTop: 4 },
});