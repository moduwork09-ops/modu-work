import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, PrimaryButton, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { ShiftPresetCard } from '../../src/features/shift-presets/shift-preset-card';
import { normalizePresetRequestQuery } from '../../src/features/shift-presets/presetGrowth';
import { recordPresetRequest, searchShiftPresetGroups, type SearchShiftPresetGroupResult } from '../../src/features/shift-presets/shiftPresetServer';
import { Header } from '../shift-types';

export default function PresetSearchScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<SearchShiftPresetGroupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const searchGeneration = useRef(0);
  const requestLock = useRef(false);

  async function search() {
    let displayQuery: string;
    try { displayQuery = normalizePresetRequestQuery(query).displayQuery; }
    catch { Alert.alert('검색어를 확인해 주세요.', '1~80자로 입력해 주세요.'); return; }
    const generation = ++searchGeneration.current;
    setLoading(true);
    setSearched('');
    setRequested(false);
    try {
      const found = await searchShiftPresetGroups(displayQuery);
      if (generation !== searchGeneration.current) return;
      setResults(found);
      setSearched(displayQuery);
    } catch {
      if (generation === searchGeneration.current) Alert.alert('근무표를 검색할 수 없어요.', '잠시 후 다시 시도해 주세요.');
    } finally { if (generation === searchGeneration.current) setLoading(false); }
  }

  async function request() {
    if (!searched || requestLock.current) return;
    requestLock.current = true;
    setRequesting(true);
    try { await recordPresetRequest(searched); setRequested(true); }
    catch { Alert.alert('요청을 저장하지 못했어요.', '잠시 후 다시 시도해 주세요.'); }
    finally { requestLock.current = false; setRequesting(false); }
  }

  return <Screen style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Header title="회사·기관에서 찾기" onBack={() => router.back()} />
    <TextInput value={query} maxLength={100} onChangeText={(value) => { setQuery(value); setSearched(''); setRequested(false); }} onSubmitEditing={() => void search()} placeholder="회사·기관명, 근무형태, 직군" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
    <PrimaryButton label={loading ? '검색 중...' : '검색'} disabled={loading || !query.trim()} onPress={() => void search()} />
    <View style={styles.list}>
      {searched && results.map(({ preset, patternFingerprint, memberCount, jobRole, workplaceName, department, verificationCount, lastVerifiedAt }) => <View key={patternFingerprint}>
        <ShiftPresetCard preset={preset} onPress={() => router.push({ pathname: '/shift-presets/preview' as never, params: { source: 'public', reference: preset.id } })} />
        <AppText variant="caption" tone="secondary" style={styles.meta}>{[`같은 패턴 근무표 ${memberCount}개`, jobRole, workplaceName, department, verificationCount ? `확인 ${verificationCount}명` : undefined, lastVerifiedAt ? `최근 확인 ${lastVerifiedAt.slice(0, 10)}` : undefined].filter(Boolean).join(' · ')}</AppText>
      </View>)}
      {searched && !loading && results.length === 0 ? <View style={styles.empty}>
        <AppText>아직 등록된 근무표가 없어요.</AppText>
        <PrimaryButton label={requested ? '요청했어요' : requesting ? '요청 중...' : '근무표 요청하기'} disabled={requested || requesting} onPress={() => void request()} />
        <PrimaryButton label="직접 만들기" onPress={() => router.push('/shift-types')} />
      </View> : null}
    </View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.md, paddingBottom: spacing.xxl },
  input: { borderRadius: radius.md, borderWidth: 1, minHeight: 50, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  list: { gap: spacing.sm }, empty: { gap: spacing.sm, alignItems: 'stretch' }, meta: { marginHorizontal: spacing.md, marginTop: spacing.xs },
});
