import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components';
import { basicStickers, suggestStickerKey, type BasicStickerKey } from './stickerRegistry';

export function StickerPicker({ title, value, onChange }: {
  title: string; value: string | null; onChange: (key: BasicStickerKey | null) => void;
}) {
  const suggested = suggestStickerKey(title);
  return <View style={styles.container}>
    <AppText style={styles.heading}>스티커</AppText>
    {suggested && value === null ? <Pressable accessibilityRole="button" onPress={() => onChange(suggested)}>
      <AppText variant="caption" tone="secondary">제목에 어울리는 스티커: {basicStickers[suggested].name} · 선택하기</AppText>
    </Pressable> : null}
    <View style={styles.grid}>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: value === null }} accessibilityLabel="스티커 없음" onPress={() => onChange(null)} style={[styles.item, value === null && styles.selected]}>
        <AppText variant="caption">없음</AppText>
      </Pressable>
      {(Object.entries(basicStickers) as [BasicStickerKey, typeof basicStickers[BasicStickerKey]][]).map(([key, item]) =>
        <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: value === key }} accessibilityLabel={`${item.name} 스티커`} onPress={() => onChange(key)} style={[styles.item, value === key && styles.selected]}>
          <Image source={item.image} resizeMode="contain" style={styles.image} />
          <AppText variant="caption" numberOfLines={1} style={styles.label}>{item.name}</AppText>
        </Pressable>) }
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 }, heading: { fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { width: '23%', minHeight: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 3, backgroundColor: '#F7F4F0' },
  selected: { borderWidth: 1.5, borderColor: '#F28C72', backgroundColor: '#FFF0EA' },
  image: { width: 28, height: 28 }, label: { fontSize: 9, textAlign: 'center' },
});
