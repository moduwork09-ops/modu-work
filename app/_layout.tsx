import { Stack } from 'expo-router';
import { NotificationProvider } from '../src/features/notifications/NotificationProvider';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../src/constants';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { useAuth } from '../src/features/auth/AuthContext';
import { ShiftScheduleProvider, useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { TutorialProvider, useTutorial } from '../src/features/tutorial/TutorialContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SessionScopedScheduleProvider />
    </AuthProvider>
  );
}

function SessionScopedScheduleProvider() {
  const { session } = useAuth();
  const ownerUserId = session?.user.id;
  return <TutorialProvider key={ownerUserId ?? 'signed-out'} ownerUserId={ownerUserId}><ShiftScheduleProvider key={ownerUserId ?? 'signed-out'} ownerUserId={ownerUserId}><NotificationProvider><RootNavigator /></NotificationProvider></ShiftScheduleProvider></TutorialProvider>;
}

function RootNavigator() {
  const theme = useAppTheme();
  const { isLoading: isAuthLoading, session } = useAuth();
  const { hasCompletedSetup, isHydrated } = useShiftSchedule();
  const { completeTutorial, isCompleted: isTutorialCompleted, isLoading: isTutorialLoading } = useTutorial();

  useEffect(() => {
    if (!session || !hasCompletedSetup || isTutorialLoading || isTutorialCompleted) return;
    void completeTutorial().catch(() => {
      // Existing setup-complete users remain unblocked even if this preference cannot be seeded.
    });
  }, [completeTutorial, hasCompletedSetup, isTutorialCompleted, isTutorialLoading, session]);

  if (isAuthLoading || !isHydrated || (Boolean(session) && isTutorialLoading)) {
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
        <Stack.Screen name="tutorial" />
        <Stack.Screen name="beta-feedback" />
        <Stack.Screen name="shift-presets/index" />
        <Stack.Screen name="shift-presets/builtin" />
        <Stack.Screen name="shift-presets/search" />
        <Stack.Screen name="shift-presets/receive" />
        <Stack.Screen name="shift-presets/preview" />
        <Stack.Screen name="shift-presets/apply" />
        <Stack.Screen name="shift-presets/share" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !hasCompletedSetup && isTutorialCompleted}>
        <Stack.Screen name="onboarding/index" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && hasCompletedSetup}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="salary" />
        <Stack.Screen name="salary-detail" />
        <Stack.Screen name="salary-settings" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="calendar-settings" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="rest-rules" />
        <Stack.Screen name="frequent-events" />
        <Stack.Screen name="together-shift-calendar" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({ loading: { alignItems: 'center', flex: 1, justifyContent: 'center' } });
