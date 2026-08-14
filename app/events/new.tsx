import { useLocalSearchParams } from 'expo-router';
import { PersonalEventForm } from '../../src/features/events/PersonalEventForm';

function getLocalToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function NewEventScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <PersonalEventForm date={date ?? getLocalToday()} />;
}
