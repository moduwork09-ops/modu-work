import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Children, Fragment, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components';
import { radius, spacing, useAppTheme } from '../../constants';

export function SettingsGroup({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {Children.toArray(children).map((child, index) => <Fragment key={index}>
      {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
      {child}
    </Fragment>)}
  </View>;
}

export function SettingsIcon({ name, colors }: {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  colors: { background: string; text: string };
}) {
  return <View style={[styles.icon, { backgroundColor: colors.background }]}>
    <MaterialCommunityIcons name={name} size={22} color={colors.text} />
  </View>;
}

export function SettingsRow({ title, description, leading, onPress, accessibilityLabel }: {
  title: string;
  description: string;
  leading: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityHint={description} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    {leading}
    <View style={styles.copy}>
      <AppText style={styles.title}>{title}</AppText>
      <AppText variant="caption" tone="secondary" style={styles.description}>{description}</AppText>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 74, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68, marginRight: spacing.md },
  pressed: { opacity: 0.7 },
});
