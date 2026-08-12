import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';

import { typography, useAppTheme } from '../constants';

type TextVariant = keyof typeof typography;
type TextTone = 'primary' | 'secondary' | 'accent';

type AppTextProps = ComponentProps<typeof Text> & {
  variant?: TextVariant;
  tone?: TextTone;
};

export function AppText({ style, variant = 'body', tone = 'primary', ...props }: AppTextProps) {
  const theme = useAppTheme();
  const color = tone === 'accent' ? theme.accent : tone === 'secondary' ? theme.textSecondary : theme.text;

  return <Text {...props} style={[styles.base, typography[variant], { color }, style]} />;
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
