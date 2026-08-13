import { useLocalSearchParams } from 'expo-router';
import { PersonalEventForm } from '../../src/features/events/PersonalEventForm';
export default function NewEventScreen() { const { date = '2026-08-13' } = useLocalSearchParams<{ date?: string }>(); return <PersonalEventForm date={date} />; }
