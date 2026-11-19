import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, EmptyState, SectionTitle } from '../components';
import { Screen } from '../components';
import { theme } from '../theme';
import type { SearchRow } from '../types';
import { timeAgo } from '../utils';

export function SavedScreen({
  searches,
  loading,
  onRefresh,
  onToggle,
  onDelete,
  onOpen,
}: {
  searches: SearchRow[];
  loading: boolean;
  onRefresh: () => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onOpen: (city: string, profession: string) => void;
}) {
  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>KAYITLI ARAMALAR</Text>
          <Text style={styles.title}>Radarın açık kalsın</Text>
        </View>
        <Pressable onPress={onRefresh} hitSlop={10} disabled={loading}>
          <Text style={styles.refresh}>{loading ? 'Yükleniyor…' : 'Yenile ↻'}</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Kaydettiğin her şehir + meslek için sunucu düzenli olarak tarama yapar. Yeni ilan görünce
        telefona bildirim gönderir.
      </Text>

      {searches.length === 0 ? (
        <EmptyState
          icon="📌"
          title="Henüz kayıt yok"
          body="Ara sekmesinde bir şehir ve meslek ara, ardından “Bu aramayı kaydet” düğmesine bas."
        />
      ) : (
        <View style={{ gap: theme.space(3) }}>
          {searches.map((search) => (
            <Card key={search.id} style={{ gap: 10 }}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.city}>{search.city}</Text>
                  <Text style={styles.profession} numberOfLines={1}>
                    {search.profession}
                  </Text>
                </View>
                <Switch
                  value={search.active === 1}
                  onValueChange={(value) => onToggle(search.id, value)}
                  trackColor={{ false: theme.colors.border, true: `${theme.colors.green}77` }}
                  thumbColor={search.active === 1 ? theme.colors.green : theme.colors.textDim}
                />
              </View>

              <View style={styles.metaRow}>
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{search.match_count} ilan kaydı</Text>
                </View>
                <Text style={styles.metaText}>
                  {search.last_checked_at
                    ? `Son kontrol ${timeAgo(search.last_checked_at)}`
                    : 'Henüz taranmadı'}
                </Text>
              </View>

              <View style={styles.actions}>
                <Button
                  title="Aramayı aç"
                  variant="ghost"
                  onPress={() => onOpen(search.city, search.profession)}
                  style={{ flex: 1, minHeight: 42 }}
                />
                <Button
                  title="Sil"
                  variant="danger"
                  onPress={() => onDelete(search.id)}
                  style={{ minHeight: 42, paddingHorizontal: 18 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Nasıl çalışır?</SectionTitle>
      <Card style={{ gap: 6 }}>
        <Text style={styles.help}>
          1. Kaydettiğin arama telefonunda saklanır.{'\n'}
          2. Android, uygulama kapalıyken yaklaşık 15 dakikada bir ilan sitelerini tarar.{'\n'}
          3. Yeni ilan bulunca telefon bildirimi gösterir.{'\n'}
          4. Bilgisayar, sunucu veya Firebase gerekmez.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
  refresh: { color: theme.colors.accent, fontWeight: '700', fontSize: 13 },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  city: { color: theme.colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  profession: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  countPill: {
    backgroundColor: theme.colors.cardSoft,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  metaText: { color: theme.colors.textDim, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  help: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 21 },
});