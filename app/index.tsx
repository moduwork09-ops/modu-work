import { Redirect } from 'expo-router';

import { useAuth } from '../src/features/auth/AuthContext';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { useTutorial } from '../src/features/tutorial/TutorialContext';
import { getEntryDestination } from '../src/features/tutorial/tutorialStorage';

export default function EntryScreen() {
  const { session } = useAuth();
  const { hasCompletedSetup } = useShiftSchedule();
  const { isCompleted: tutorialCompleted } = useTutorial();

  return <Redirect href={getEntryDestination({ hasSession: Boolean(session), hasCompletedSetup, tutorialCompleted })} />;
}
