import { Stack } from 'expo-router';

import { ShiftScheduleProvider } from '../src/features/shifts/ShiftScheduleContext';

export default function RootLayout() {
  return (
    <ShiftScheduleProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ShiftScheduleProvider>
  );
}
