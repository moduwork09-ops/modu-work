import { useLocalSearchParams } from 'expo-router';
import { PersonalEventForm } from '../../src/features/events/PersonalEventForm';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
export default function EditEventScreen() { const { id } = useLocalSearchParams<{ id: string }>(); const { personalEvents } = useShiftSchedule(); const event = personalEvents.find((item) => item.id === id); return <PersonalEventForm existing={event} date={event?.date ?? '2026-08-13'} />; }
