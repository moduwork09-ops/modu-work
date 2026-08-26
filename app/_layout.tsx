import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../src/constants';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { useAuth } from '../src/features/auth/AuthContext';
import { ShiftScheduleProvider, useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SessionScopedScheduleProvider />
    </AuthProvider>
  );
}

function SessionScopedScheduleProvider() {
  const { session } = useAuth();
  return <ShiftScheduleProvider key={session?.user.id ?? 'signed-out'} ownerUserId={session?.user.id}><RootNavigator /></ShiftScheduleProvider>;
}

function RootNavigator() {
  const theme = useAppTheme();
  const { isLoading: isAuthLoading, session } = useAuth();
  const { hasCompletedSetup, isHydrated } = useShiftSchedule();

  if (isAuthLoading || !isHydrated) {
    return <View style={[styles.loading, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.primary} /></View>;
  }

  return (
    <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="account" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !hasCompletedSetup}>
        <Stack.Screen name="onboarding/index" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && hasCompletedSetup}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="salary" />
        <Stack.Screen name="salary-detail" />
        <Stack.Screen name="salary-settings" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({ loading: { alignItems: 'center', flex: 1, justifyContent: 'center' } });
