import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';
import type { CityInfo } from './types';

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.75 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({
  label,
  color,
  subtle,
}: {
  label: string;
  color: string;
  subtle?: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: subtle ? theme.colors.cardSoft : `${color}22`, borderColor: `${color}55` },
      ]}
    >
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color: subtle ? theme.colors.textMuted : color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: theme.colors.accent, fg: '#1B1204', border: theme.colors.accent },
    ghost: { bg: 'transparent', fg: theme.colors.text, border: theme.colors.border },
    danger: { bg: theme.colors.redSoft, fg: theme.colors.red, border: `${theme.colors.red}55` },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'none',
  keyboardType,
  onSubmitEditing,
  right,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'url';
  onSubmitEditing?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textDim}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType ?? 'default'}
          onSubmitEditing={onSubmitEditing}
          style={styles.input}
          autoCorrect={false}
        />
        {right}
      </View>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.errorAction}>
          <Text style={styles.errorActionText}>Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, body, icon = '📭' }: { title: string; body: string; icon?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function CityPicker({
  visible,
  cities,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  cities: CityInfo[];
  selected?: string;
  onSelect: (city: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return cities;
    return cities.filter((city) => city.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [cities, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Şehir seç</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.sheetClose}>Kapat</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Şehir ara…"
            placeholderTextColor={theme.colors.textDim}
            style={[styles.input, { marginHorizontal: theme.space(5) }]}
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.plate)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: theme.space(5), paddingBottom: theme.space(10) }}
            renderItem={({ item }) => {
              const active = item.name === selected;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.name);
                    setQuery('');
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.cityRow,
                    active && { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.cityName, active && { color: theme.colors.accent }]}>{item.name}</Text>
                  <Text style={styles.cityPlate}>{item.plate}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: theme.colors.textMuted, textAlign: 'center', padding: 20 }}>
                Şehir bulunamadı
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: theme.space(5), paddingBottom: theme.space(15), gap: theme.space(4) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.space(4),
    gap: theme.space(2),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  button: {
    minHeight: 50,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space(5),
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  fieldLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  errorBanner: {
    backgroundColor: theme.colors.redSoft,
    borderWidth: 1,
    borderColor: `${theme.colors.red}55`,
    borderRadius: theme.radius.md,
    padding: theme.space(4),
    gap: 8,
  },
  errorText: { color: theme.colors.red, fontSize: 13, lineHeight: 19 },
  errorAction: { alignSelf: 'flex-start' },
  errorActionText: { color: theme.colors.red, fontWeight: '800', fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: theme.space(12), gap: 6 },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    minHeight: '55%',
    backgroundColor: theme.colors.bgElevated,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.space(5),
    marginBottom: theme.space(3),
  },
  sheetTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  sheetClose: { color: theme.colors.textMuted, fontWeight: '700' },
  cityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  cityName: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  cityPlate: { color: theme.colors.textDim, fontSize: 12 },
  screen: { flex: 1, backgroundColor: theme.colors.bg },
});