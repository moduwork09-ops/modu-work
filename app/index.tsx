import { Redirect } from 'expo-router';

import { useAuth } from '../src/features/auth/AuthContext';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

export default function EntryScreen() {
  const { session } = useAuth();
  const { hasCompletedSetup } = useShiftSchedule();

  if (!session) return <Redirect href="/auth" />;
  return <Redirect href={hasCompletedSetup ? '/(tabs)' : '/onboarding'} />;
}
