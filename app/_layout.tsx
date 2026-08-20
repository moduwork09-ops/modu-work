import { Stack } from 'expo-router';

import { ShiftScheduleProvider, useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

export default function RootLayout() {
  return (
    <ShiftScheduleProvider>
      <RootNavigator />
    </ShiftScheduleProvider>
  );
}

function RootNavigator() {
  const { hasCompletedSetup, isHydrated } = useShiftSchedule();

  if (!isHydrated) {
    return null;
  }

  return <Stack initialRouteName={hasCompletedSetup ? '(tabs)' : 'onboarding/index'} screenOptions={{ headerShown: false }} />;
}
