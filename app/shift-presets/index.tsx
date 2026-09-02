import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Card, Screen } from '../../src/components';
import { spacing, useAppTheme } from '../../src/constants';
import { Header } from '../shift-types';

const choices = [
  ['briefcase-search-outline', '회사·기관에서 찾기', '회사·기관명 또는 근무형태를 검색해요', '/shift-presets/search'],
  ['ticket-confirmation-outline', '공유 코드로 받기', '동료가 보내준 근무표를 불러와요', '/shift-presets/receive'],
  ['view-grid-outline', '기본 프리셋', '주간·2교대·3교대 등에서 골라요', '/shift-presets/builtin'],
  ['pencil-outline', '직접 만들기', '내 근무형태와 패턴을 직접 만들어요', '/shift-types?setup=true'],
] as const;

export default function ShiftPresetsEntryScreen() {
  const router = useRouter(); const theme = useAppTheme();
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><Header title="근무표 설정" onBack={() => router.back()} /><View style={styles.intro}><AppText variant="heading">근무표를 설정해볼까요?</AppText><AppText tone="secondary">내게 맞는 방법을 선택해 주세요.</AppText></View><View style={styles.list}>{choices.map(([icon,title,description,href]) => <Pressable key={title} onPress={() => router.push(href as never)}><Card style={styles.card}><MaterialCommunityIcons name={icon} size={25} color={theme.primary} /><View style={styles.text}><AppText style={styles.title}>{title}</AppText><AppText variant="caption" tone="secondary">{description}</AppText></View><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Card></Pressable>)}</View></ScrollView></Screen>;
}
const styles = StyleSheet.create({ screen:{paddingTop:spacing.sm,paddingBottom:0},content:{paddingBottom:spacing.xxl},intro:{gap:spacing.xs,marginTop:spacing.xl},list:{gap:spacing.sm,marginTop:spacing.xl},card:{alignItems:'center',flexDirection:'row',gap:spacing.md},text:{flex:1},title:{fontWeight:'700'} });
