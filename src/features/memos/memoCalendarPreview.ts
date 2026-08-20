import type { DateMemo } from './dateMemoStorage';

export function getMemoCalendarPreview(memos: DateMemo[]) {
  return { visible: memos.slice(0, 2), remainingCount: Math.max(0, memos.length - 2) };
}
