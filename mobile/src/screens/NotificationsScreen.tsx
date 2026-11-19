import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Screen } from '../components';
import { theme } from '../theme';
import type { NotificationRow } from '../types';
import { timeAgo } from '../utils';

export function NotificationsScreen({
  notifications,
  loading,
  onRefresh,
  onMarkAllRead,
}: {
  notifications: NotificationRow[];
  loading: boolean;
  onRefresh: () => void;
  onMarkAllRead: () => void;
}) {
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>BİLDİRİMLER</Text>
          <Text style={styles.title}>İlan akışı</Text>
        </View>
        <Pressable onPress={onRefresh} hitSlop={10} disabled={loading}>
          <Text style={styles.refresh}>{loading ? 'Yükleniyor…' : 'Yenile ↻'}</Text>
        </Pressable>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {unread > 0 ? `${unread} okunmamış bildirim` : 'Tüm bildirimler okundu'}
        </Text>
        {unread > 0 ? (
          <Pressable onPress={onMarkAllRead} hitSlop={8}>
            <Text style={styles.markRead}>Tümünü okundu işaretle</Text>
          </Pressable>
        ) : null}
      </View>

      {notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Henüz bildirim yok"
          body="Kayıtlı aramalarında yeni bir ilan çıktığında bildirimler burada ve telefonun bildirim panelinde görünür."
        />
      ) : (
        <View style={{ gap: theme.space(3) }}>
          {notifications.map((notification) => {
            const isUnread = !notification.read_at;
            return (
              <Card key={notification.id} style={[styles.card, isUnread && styles.unreadCard]}>
                <View style={styles.cardHead}>
                  {isUnread ? <View style={styles.dot} /> : null}
                  <Text style={[styles.cardTitle, isUnread && { color: theme.colors.text }]} numberOfLines={2}>
                    {notification.title}
                  </Text>
                  <Text style={styles.ago}>{timeAgo(notification.created_at)}</Text>
                </View>
                <Text style={styles.body}>{notification.body}</Text>
              </Card>
            );
          })}
        </View>
      )}

      <Text style={styles.footer}>
        Bildirimler, uygulama kapalıyken de Android bildirim panelinde görünür. Bildirime dokunarak
        uygulamayı açabilirsin.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { color: theme.colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
  refresh: { color: theme.colors.accent, fontWeight: '700', fontSize: 13 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  summaryText: { color: theme.colors.textMuted, fontSize: 12 },
  markRead: { color: theme.colors.blue, fontSize: 12, fontWeight: '700' },
  card: { gap: 6 },
  unreadCard: { borderColor: `${theme.colors.accent}66`, backgroundColor: '#171B24' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.accent },
  cardTitle: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '800', flex: 1 },
  ago: { color: theme.colors.textDim, fontSize: 10 },
  body: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  footer: { color: theme.colors.textDim, fontSize: 10, lineHeight: 15, paddingTop: 4 },
});