import { useRouter } from 'expo-router';

import { ShiftTypeEditor } from '../../src/features/shift-settings/ShiftTypeEditor';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';

export default function NewShiftTypeScreen() {
  const router = useRouter();
  const { addShiftType } = useShiftSchedule();

  return <ShiftTypeEditor title="근무유형 추가" onBack={() => router.back()} onSave={addShiftType} />;
}
