export const brandColors = {
  deepNavy: '#243447',
  warmIvory: '#F8F6F1',
  coral: '#F28C72',
  sage: '#A8B8A0',
  charcoal: '#252525',
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
