import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ShiftTypeEditor } from '../../src/features/shift-settings/ShiftTypeEditor';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';

export default function EditShiftTypeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shiftTypes, updateShiftType, deleteShiftType } = useShiftSchedule();
  const shiftType = shiftTypes.find((item) => item.id === id);

  if (!shiftType) {
    router.back();
    return null;
  }

  const save = (nextShiftType: Omit<typeof shiftType, 'id'>) => updateShiftType({ ...nextShiftType, id: shiftType.id });
  const confirmDelete = () => {
    Alert.alert('이 근무유형을 삭제할까요?', '현재 근무패턴에서 사용 중인 유형은 삭제할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { void (async () => {
        const result = await deleteShiftType(shiftType.id);
        if (result === 'success') { router.back(); return; }
        if (result === 'in-use') { Alert.alert('삭제할 수 없어요.', '현재 근무패턴에서 사용 중인 근무유형이에요. 먼저 근무패턴에서 제거해주세요.'); return; }
        if (result === 'last-type') { Alert.alert('삭제할 수 없어요.', '근무유형은 최소 1개 이상 필요해요.'); return; }
        Alert.alert('저장에 실패했어요.', '다시 시도해주세요.');
      })(); } },
    ]);
  };

  return <ShiftTypeEditor title="근무유형 수정" initialShiftType={shiftType} onBack={() => router.back()} onSave={save} onDelete={confirmDelete} />;
}
