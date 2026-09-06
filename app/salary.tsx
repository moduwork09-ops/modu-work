import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { spacing, useAppTheme } from '../src/constants';
import { useSalarySettings } from '../src/features/salary/useSalarySettings';
import { tryCalculateMonthlySalary, formatWon } from '../src/features/salary/salaryCalculator';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

function currentMonth() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function moveMonth(value: string, delta: number) { const [y, m] = value.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

export default function SalaryScreen() {
  const router = useRouter(); const theme = useAppTheme(); const {settings,failed,saving,save}=useSalarySettings();
  const schedule = useShiftSchedule(); const [month, setMonth] = useState(currentMonth());

  const calculation = useMemo(() => settings ? tryCalculateMonthlySalary(month, schedule, settings) : null, [month, schedule, settings]);
  const previousCalculation = useMemo(() => settings ? tryCalculateMonthlySalary(moveMonth(month, -1), schedule, settings) : null, [month, schedule, settings]);
  if (!settings) return <Screen><View style={styles.center}>{failed ? <><AppText>급여 설정을 불러올 수 없어요.</AppText><PrimaryButton label="다시 시도" onPress={() => router.replace('/salary')} /></> : <ActivityIndicator color={theme.primary} />}</View></Screen>;
  if (!settings.isConfigured) return <Screen><View style={styles.header}><Pressable onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} /></Pressable><AppText variant="title">급여</AppText></View><View style={styles.empty}><AppText variant="title">급여 계산을 시작해볼까요?</AppText><AppText tone="secondary">근무표를 기반으로 이번 달 예상 급여를 계산해드려요.{`\n\n`}1. 기본급 입력{`\n`}2. 근무별 수당 설정{`\n`}3. 추가 수당 설정</AppText><PrimaryButton label="시작하기" onPress={() => router.push('/salary-settings')} /></View></Screen>;
  if (!calculation || !previousCalculation) return <Screen><AppText>금액이 너무 크거나 근무 데이터를 계산할 수 없어요.</AppText><PrimaryButton label="급여 설정 확인" onPress={()=>router.push('/salary-settings')}/><PrimaryButton label="뒤로" onPress={()=>router.back()}/></Screen>;

  const toggleVisibility = async () => { try { await save({...settings,salaryVisible:!settings.salaryVisible}); } catch { Alert.alert('저장하지 못했어요.','다시 시도해주세요.'); } };
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} /></Pressable><AppText variant="title">급여</AppText></View>
    <View style={styles.monthRow}><Pressable onPress={() => setMonth(moveMonth(month, -1))}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} /></Pressable><AppText style={styles.month}>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</AppText><Pressable onPress={() => setMonth(moveMonth(month, 1))}><MaterialCommunityIcons name="chevron-right" size={28} color={theme.text} /></Pressable></View>
    <Card><View style={styles.row}><AppText tone="secondary">이번 달 예상 급여</AppText><Pressable accessibilityLabel={settings.salaryVisible ? '급여 숨기기' : '급여 보이기'} disabled={saving} hitSlop={12} onPress={() => void toggleVisibility()}><MaterialCommunityIcons name={settings.salaryVisible ? 'eye-outline' : 'eye-off-outline'} size={24} color={theme.textSecondary} /></Pressable></View><AppText style={styles.total}>{settings.salaryVisible ? formatWon(calculation!.total) : '•••••••원'}</AppText><AppText tone="secondary">기본급 {formatWon(calculation!.baseSalary)} · 예상 수당 {formatWon(calculation!.shiftAllowanceTotal + calculation!.additionalAllowanceTotal)}</AppText><AppText tone="secondary">지난달 대비 {calculation!.total - previousCalculation!.total >= 0 ? '+' : ''}{formatWon(calculation!.total - previousCalculation!.total)}</AppText></Card>
    <AppText style={styles.section}>이번 달 근무</AppText>
    <View style={styles.shiftGrid}>{calculation.shiftGroups.map(group => <Card key={group.shift.id} style={styles.shiftCard}>
      <View style={[styles.dot, { backgroundColor: group.shift.color }]} /><AppText>{group.shift.name}</AppText><AppText style={styles.count}>{group.count}회</AppText>
    </Card>)}</View>
    <AppText style={styles.section}>근무 수당</AppText><Card>{calculation.shiftGroups.filter(group => group.total > 0).map(group =>
      <View key={group.shift.id} style={styles.line}><View style={{flex:1}}><AppText>{group.shift.name}</AppText>
        <AppText tone="secondary">{group.unitAmount === null ? group.count + '회 · 날짜별 설정 단가' : group.count + '회 × ' + formatWon(group.unitAmount)}</AppText>
      </View><AppText>{formatWon(group.total)}</AppText></View>)}
      <View style={styles.line}><AppText style={styles.bold}>합계</AppText><AppText style={styles.bold}>{formatWon(calculation.shiftAllowanceTotal)}</AppText></View>
    </Card>
    <AppText style={styles.section}>고정 · 추가 수당</AppText><Card>{calculation!.applicableAdditionalAllowances.slice(0, 3).map((item) => <View key={item.id} style={styles.line}><AppText style={{flex:1}}>{item.name}</AppText><AppText>{formatWon(item.amount)}</AppText></View>)}{calculation!.applicableAdditionalAllowances.length === 0 && <AppText tone="secondary">등록된 추가 수당이 없어요.</AppText>}</Card>
    <PrimaryButton label="계산 상세 보기" onPress={() => router.push({ pathname: '/salary-detail', params: { month } })} /><Pressable onPress={() => router.push('/salary-settings')}><AppText style={styles.settingsLink}>급여 설정</AppText></Pressable><AppText tone="secondary" style={styles.notice}>설정된 근무표와 수당을 기준으로 계산한 예상 금액입니다. 실제 지급액과 차이가 있을 수 있습니다.</AppText>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen:{paddingBottom:0},content:{paddingBottom:spacing.xxl,gap:spacing.lg},center:{flex:1,justifyContent:'center',gap:spacing.lg},header:{alignItems:'center',flexDirection:'row',gap:spacing.sm},empty:{flex:1,justifyContent:'center',gap:spacing.xl},monthRow:{alignItems:'center',flexDirection:'row',justifyContent:'space-between'},month:{fontWeight:'700',fontSize:18},row:{alignItems:'center',flexDirection:'row',justifyContent:'space-between'},total:{fontSize:32,fontWeight:'800',marginVertical:spacing.md},section:{fontSize:18,fontWeight:'700',marginTop:spacing.md},shiftGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},shiftCard:{alignItems:'center',flexGrow:1,flexBasis:'45%',gap:spacing.xxs},dot:{borderRadius:6,height:12,width:12},count:{fontWeight:'700',marginTop:spacing.sm},line:{alignItems:'center',flexDirection:'row',flexWrap:'wrap',gap:spacing.xs,justifyContent:'space-between',paddingVertical:spacing.sm},bold:{fontWeight:'700'},settingsLink:{fontWeight:'700',textAlign:'center'},notice:{lineHeight:20,textAlign:'center'} });
