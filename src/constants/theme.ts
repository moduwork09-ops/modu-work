import { useColorScheme } from 'react-native';

export const brandColors = {
  deepNavy: '#243447',
  warmIvory: '#F8F6F1',
  coral: '#F28C72',
  sage: '#A8B8A0',
  charcoal: '#252525',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const typography = {
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  button: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
} as const;

export const calendarShiftColors = {
  day: { background: '#F3E2B8', text: '#6B4A00' },
  night: { background: brandColors.deepNavy, text: brandColors.white },
  offDuty: { background: '#ECEAF4', text: '#5E5A75' },
  rest: { background: '#E3EBE0', text: '#4C6350' },
  annualLeave: { background: '#FCE0D8', text: '#A84D37' },
  training: { background: '#DCEAF5', text: '#365C7D' },
} as const;

export type ThemeMode = 'light' | 'dark' | 'system';

export type AppTheme = {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  accent: string;
  rest: string;
  border: string;
};

export const lightTheme: AppTheme = {
  background: brandColors.warmIvory,
  surface: '#FFFFFF',
  text: brandColors.charcoal,
  textSecondary: '#66727D',
  primary: brandColors.deepNavy,
  accent: brandColors.coral,
  rest: brandColors.sage,
  border: '#E5E1D9',
};

export const darkTheme: AppTheme = {
  background: '#18232E',
  surface: '#243447',
  text: '#F8F6F1',
  textSecondary: '#C5CDD2',
  primary: '#F8F6F1',
  accent: brandColors.coral,
  rest: brandColors.sage,
  border: '#3A4B59',
};

export function useAppTheme(): AppTheme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
