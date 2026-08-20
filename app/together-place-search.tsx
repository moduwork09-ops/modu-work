import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import {
  PlaceSearchConfigurationError,
  RECOMMENDED_PLACES,
  searchPlaces,
  setPendingPlaceSelection,
  type PlaceSearchResult,
} from '../src/features/place-search';

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

function Header({ onBack }: { onBack: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>장소 검색</AppText>
      <View style={styles.headerButton} />
    </View>
  );
}

export default function TogetherPlaceSearchScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceSearchResult[]>(RECOMMENDED_PLACES);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [retrySequence, setRetrySequence] = useState(0);
  const isRecommended = query.trim().length === 0;
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setPlaces(RECOMMENDED_PLACES);
      setStatus('idle');
      setErrorMessage('');
      return;
    }
    if (trimmedQuery.length < 2) {
      setPlaces([]);
      setStatus('idle');
      setErrorMessage('');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading');
      setErrorMessage('');
      void searchPlaces(trimmedQuery, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setPlaces(results);
          setStatus(results.length ? 'success' : 'empty');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPlaces([]);
          setStatus('error');
          setErrorMessage(error instanceof PlaceSearchConfigurationError
            ? error.message
            : '잠시 후 다시 검색해 주세요.');
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [retrySequence, trimmedQuery]);

  const clearQuery = useCallback(() => setQuery(''), []);

  return (
    <Screen style={styles.screen}>
      <Header onBack={() => router.back()} />
      <View style={[styles.searchField, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <MaterialCommunityIcons name="magnify" color={theme.textSecondary} size={21} />
        <TextInput autoCorrect={false} onChangeText={setQuery} placeholder="장소명이나 주소를 검색하세요" placeholderTextColor={theme.textSecondary} returnKeyType="search" style={[styles.searchInput, { color: theme.text }]} value={query} />
        {query.length > 0 && (
          <Pressable accessibilityLabel="검색어 지우기" accessibilityRole="button" hitSlop={6} onPress={clearQuery} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="close-circle" color={theme.textSecondary} size={19} />
          </Pressable>
        )}
      </View>
      <AppText style={styles.resultLabel}>{isRecommended ? '추천 장소' : '검색 결과'}</AppText>
      <ScrollView contentContainerStyle={[styles.results, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.resultsScroll}>
        {status === 'loading' ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-search-outline" color={brandColors.coral} size={34} />
            <AppText style={styles.emptyTitle}>장소를 찾고 있어요...</AppText>
          </View>
        ) : status === 'error' ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="alert-circle-outline" color={theme.textSecondary} size={34} />
            <AppText style={styles.emptyTitle}>장소를 불러오지 못했어요</AppText>
            <AppText variant="caption" tone="secondary">{errorMessage}</AppText>
            {!(errorMessage.includes('API 키')) && (
              <Pressable accessibilityRole="button" onPress={() => setRetrySequence((value) => value + 1)} style={({ pressed }) => [styles.retryButton, { borderColor: theme.border }, pressed && styles.pressed]}>
                <AppText style={styles.retryText}>다시 시도</AppText>
              </Pressable>
            )}
          </View>
        ) : trimmedQuery.length === 1 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="text-search" color={theme.textSecondary} size={34} />
            <AppText style={styles.emptyTitle}>두 글자 이상 입력해 주세요</AppText>
          </View>
        ) : places.length > 0 ? places.map((place, index) => (
          <View key={place.id}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
            <Pressable
              accessibilityLabel={`${place.name}, ${place.roadAddress}`}
              accessibilityRole="button"
              onPress={() => { setPendingPlaceSelection(place); router.back(); }}
              style={({ pressed }) => [styles.placeRow, pressed && styles.placeRowPressed]}
            >
              <View style={styles.placeIcon} accessibilityElementsHidden>
                <MaterialCommunityIcons name="map-marker-outline" color={brandColors.coral} size={21} />
              </View>
              <View style={styles.placeTextArea}>
                <View style={styles.placeTitleRow}>
                  <AppText style={styles.placeName}>{place.name}</AppText>
                  {place.category && <AppText variant="caption" tone="secondary">{place.category}</AppText>}
                </View>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>{place.roadAddress}</AppText>
                {place.address && <AppText variant="caption" tone="secondary" numberOfLines={1}>지번 {place.address}</AppText>}
              </View>
              <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={19} />
            </Pressable>
          </View>
        )) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-search-outline" color={theme.textSecondary} size={34} />
            <AppText style={styles.emptyTitle}>검색 결과가 없습니다</AppText>
            <AppText variant="caption" tone="secondary">다른 장소명이나 주소로 검색해 보세요.</AppText>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18, lineHeight: 24 },
  searchField: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', marginTop: spacing.sm, minHeight: 46, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  clearButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 32 },
  resultLabel: { fontSize: 14, fontWeight: '700', lineHeight: 20, paddingBottom: spacing.xs, paddingTop: spacing.md },
  resultsScroll: { flex: 1 },
  results: { flexGrow: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  placeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 76, paddingVertical: spacing.sm },
  placeRowPressed: { backgroundColor: '#FFF6F1' },
  placeIcon: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.md, height: 38, justifyContent: 'center', width: 38 },
  placeTextArea: { flex: 1, gap: 1 },
  placeTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  placeName: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  emptyState: { alignItems: 'center', flex: 1, gap: spacing.xs, justifyContent: 'center', paddingBottom: spacing.xxl },
  emptyTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  retryButton: { borderRadius: radius.xxl, borderWidth: 1, marginTop: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  retryText: { color: brandColors.coral, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  pressed: { opacity: 0.78 },
});
