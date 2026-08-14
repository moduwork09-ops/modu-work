import type { ShiftKind } from './mockData';

export type ShiftTypeDraft = {
  name: string;
  abbreviation: string;
  kind: ShiftKind;
  startTime: string;
  endTime: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateShiftTypeDraft(draft: ShiftTypeDraft) {
  const name = draft.name.trim();
  const abbreviation = draft.abbreviation.trim();

  if (!name) return '근무유형 이름을 입력해주세요.';
  if (name.length > 20) return '근무유형 이름은 20자 이하로 입력해주세요.';
  if (!abbreviation) return '달력 표시 약칭을 입력해주세요.';
  if (abbreviation.length > 2) return '달력 표시 약칭은 2자 이하로 입력해주세요.';

  if (draft.kind === 'work') {
    if (!TIME_PATTERN.test(draft.startTime) || !TIME_PATTERN.test(draft.endTime)) {
      return '시간은 09:00처럼 HH:mm 형식으로 입력해주세요.';
    }

    if (draft.startTime === draft.endTime) return '시작 시간과 종료 시간은 같을 수 없어요.';
  }

  return null;
}
