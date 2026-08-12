import type { ComponentProps } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';

import { radius, spacing, useAppTheme } from '../constants';
import { AppText } from './AppText';

type PrimaryButtonProps = Omit<ComponentProps<typeof Pressable>, 'children' | 'style'> & {
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, style, ...props }: PrimaryButtonProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }, style]}
      {...props}
    >
      <AppText variant="button" style={{ color: theme.surface, textAlign: 'center' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
