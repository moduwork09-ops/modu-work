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
  const { isHydrated } = useShiftSchedule();

  if (!isHydrated) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
