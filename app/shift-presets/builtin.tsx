import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { BUILTIN_PRESET_CATEGORIES, selectBuiltinShiftPresets } from '../../src/features/shift-presets/builtinShiftPresets';
import { ShiftPresetCard } from '../../src/features/shift-presets/shift-preset-card';
import { Header } from '../shift-types';

type Category = (typeof BUILTIN_PRESET_CATEGORIES)[number];

export default function BuiltinPresetsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const [category, setCategory] = useState<Category>('전체');
  const presets = selectBuiltinShiftPresets(category);
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Header title="기본 프리셋" onBack={() => router.back()} />
    <AppText tone="secondary" style={styles.description}>범용 예시를 확인하고 내 근무표로 복사할 수 있어요.</AppText>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
      {BUILTIN_PRESET_CATEGORIES.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.category, { borderColor: theme.border }, category === item && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        <AppText style={{ color: category === item ? theme.surface : theme.text, fontWeight: '700' }}>{item}</AppText>
      </Pressable>)}
    </ScrollView>
    <View style={styles.list}>{presets.length ? presets.map((preset) => <ShiftPresetCard key={preset.id} preset={preset} onPress={() => router.push({ pathname: '/shift-presets/preview' as never, params: { source: 'builtin', reference: preset.id } })} />) : <AppText tone="secondary">해당 분류의 기본 프리셋이 아직 없어요.</AppText>}</View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { paddingBottom: spacing.xxl },
  description: { marginTop: spacing.lg },
  categories: { gap: spacing.xs, paddingVertical: spacing.md },
  category: { borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: spacing.md, minHeight: 38, justifyContent: 'center' },
  list: { gap: spacing.sm, marginTop: spacing.xs },
});
