import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Card, Screen } from '../src/components';
import { spacing, useAppTheme } from '../src/constants';
import { useSalarySettings } from '../src/features/salary/useSalarySettings';
import { tryCalculateMonthlySalary, formatWon, isCalendarMonth } from '../src/features/salary/salaryCalculator';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

export default function SalaryDetailScreen() {
  const router=useRouter(); const theme=useAppTheme(); const { month: rawMonth }=useLocalSearchParams<{month?:string|string[]}>(); const {settings}=useSalarySettings(); const schedule=useShiftSchedule();
  const month=typeof rawMonth==='string'&&isCalendarMonth(rawMonth)?rawMonth:null;

  const result=useMemo(()=>month&&settings?tryCalculateMonthlySalary(month,schedule,settings):null,[month,schedule,settings]);
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><View style={styles.header}><Pressable onPress={()=>router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.text}/></Pressable><AppText variant="title">급여 상세</AppText>{month&&<AppText tone="secondary">{Number(month.slice(5))}월</AppText>}</View>{!result?<AppText tone="secondary">급여 상세를 불러올 수 없어요.</AppText>:<>
  <Card><AppText tone="secondary">예상 급여</AppText><AppText style={styles.total}>{formatWon(result.total)}</AppText></Card>
  <AppText style={styles.section}>기본 급여</AppText><Card><View style={styles.row}><AppText>기본급</AppText><AppText>{formatWon(result.baseSalary)}</AppText></View></Card>
  <AppText style={styles.section}>근무 수당 · {formatWon(result.shiftAllowanceTotal)}</AppText><Card>{result.shiftDetails.map(item=><View key={item.date} style={styles.detail}><View style={{flex:1}}><AppText>{Number(item.date.slice(5,7))}월 {Number(item.date.slice(8))}일 · {item.name}</AppText><AppText tone="secondary">{item.timeLabel}</AppText></View><AppText>+{formatWon(item.amount)}</AppText></View>)}{result.shiftDetails.length===0&&<AppText tone="secondary">적용된 근무 수당이 없어요.</AppText>}</Card>
  <AppText style={styles.section}>추가 수당 · {formatWon(result.additionalAllowanceTotal)}</AppText><Card>{result.applicableAdditionalAllowances.map(item=><View key={item.id} style={styles.row}><AppText style={{flex:1}}>{item.name}</AppText><AppText>{formatWon(item.amount)}</AppText></View>)}{result.applicableAdditionalAllowances.length===0&&<AppText tone="secondary">적용된 추가 수당이 없어요.</AppText>}</Card>
  <View style={styles.row}><AppText style={styles.section}>예상 합계</AppText><AppText style={styles.section}>{formatWon(result.total)}</AppText></View><AppText tone="secondary">설정된 근무표와 수당을 기준으로 한 예상 금액이며 실제 지급액과 차이가 있을 수 있습니다.</AppText></>}</ScrollView></Screen>;
}
const styles=StyleSheet.create({screen:{paddingBottom:0},content:{paddingBottom:spacing.xxl,gap:spacing.lg},header:{alignItems:'center',flexDirection:'row',gap:spacing.sm},total:{fontSize:30,fontWeight:'800',marginTop:spacing.sm},section:{fontSize:18,fontWeight:'700'},row:{alignItems:'center',flexDirection:'row',flexWrap:'wrap',gap:spacing.xs,justifyContent:'space-between',paddingVertical:spacing.sm},detail:{alignItems:'center',flexDirection:'row',flexWrap:'wrap',gap:spacing.xs,justifyContent:'space-between',paddingVertical:spacing.md}});
