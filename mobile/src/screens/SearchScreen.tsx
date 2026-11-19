import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Button, Card, CityPicker, EmptyState, ErrorBanner, Field, Pill, Screen } from '../components';
import { CITIES } from '../local/cities';
import { DATE_RANGES, type DateRange } from '../local/dateRange';
import type { LocalSearchResponse } from '../local/types';
import { sourceLabels, theme } from '../theme';
import { formatDuration, timeAgo } from '../utils';

export interface Prefill {
  city: string;
  profession: string;
  nonce: number;
}

export interface SaveResult {
  count: number;
  message: string;
}

export function SearchScreen({
  prefill,
  onSearch,
  onSave,
}: {
  prefill: Prefill | null;
  onSearch: (city: string, profession: string, range: DateRange) => Promise<LocalSearchResponse>;
  onSave: (city: string, profession: string, ids: string[]) => Promise<SaveResult>;
}) {
  const [city, setCity] = useState(prefill?.city ?? 'Gaziantep');
  const [profession, setProfession] = useState(prefill?.profession ?? '');
  const [range, setRange] = useState<DateRange>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<LocalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setCity(prefill.city);
    setProfession(prefill.profession);
    void runSearch(false, { city: prefill.city, profession: prefill.profession });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  async function runSearch(
    fresh: boolean,
    override?: { city?: string; profession?: string; range?: DateRange },
  ) {
    const cityValue = (override?.city ?? city).trim();
    const trimmed = (override?.profession ?? profession).trim();
    const rangeValue = override?.range ?? range;
    if (!cityValue) {
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
      const data = await onSearch(cityValue, trimmed, rangeValue);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function changeRange(next: DateRange) {
    setRange(next);
    if (result) {
      void runSearch(false, {
        city: result.city,
        profession: result.profession,
        range: next,
      });
    }
  }

  async function saveSearch() {
    if (!result) {
      Alert.alert('Önce arama yap', 'Kaydetmek için önce sonuçları getir.');
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave(
        result.city,
        result.profession,
        result.allIds.length > 0 ? result.allIds : result.items.map((item) => item.id),
      );
      Alert.alert('Arama kaydedildi', saved.message);
    } catch (err) {
      Alert.alert('Kaydedilemedi', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const failedSources = result?.sources.filter((source) => source.warning && !source.ok) ?? [];
  const isEmpty = result && result.items.length === 0;
  const cities = CITIES.map((item) => ({ name: item.name, plate: item.plate }));

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>TELEFONDA ÇALIŞAN RADAR</Text>
        <Text style={styles.heroTitle}>Yeni ilanı{'\n'}sen bulma, biz bulalım.</Text>
        <Text style={styles.heroBody}>
          Kariyer.net, Eleman.net, İŞKUR ve Kariyer Kapısı doğrudan telefonunda taranır.
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
          title={loading ? 'İlanlar taranıyor…' : 'İlanları ara'}
          onPress={() => void runSearch(false)}
          loading={loading}
        />
        <Text style={styles.hint}>
          Derin arama: ilan siteleri + Google News + Instagram/Facebook/X. Sonuçlar 5 dakika
          önbelleklenir.
        </Text>
      </Card>

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Tarih aralığı</Text>
        <View style={styles.rangeRow}>
          {DATE_RANGES.map((option) => {
            const active = range === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => changeRange(option.key)}
                style={({ pressed }) => [
                  styles.rangeChip,
                  active && styles.rangeChipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void runSearch(true)} /> : null}

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
                    key={item.id}
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
            sonuçlar orijinal siteye yönlendirir. Sosyal medya ve haber sonuçlarında tarih yaklaşık
            olabilir.
          </Text>
        </>
      ) : null}

      <CityPicker
        visible={pickerOpen}
        cities={cities}
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
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  rangeText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  rangeTextActive: { color: theme.colors.accent },
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