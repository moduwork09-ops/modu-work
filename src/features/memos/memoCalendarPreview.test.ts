import { strict as assert } from 'node:assert';
import { getMemoCalendarPreview } from './memoCalendarPreview';
import type { DateMemo } from './dateMemoStorage';

const memo = (id: string): DateMemo => ({ id, text: id, color: '#FFF1A8', timeEnabled: false, allDay: true, startTime: null, endTime: null, reminderMinutes: null, notificationId: null });

assert.deepEqual(getMemoCalendarPreview([]), { visible: [], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1')]), { visible: [memo('1')], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1'), memo('2')]), { visible: [memo('1'), memo('2')], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1'), memo('2'), memo('3'), memo('4')]), { visible: [memo('1'), memo('2')], remainingCount: 2 });
console.log('memoCalendarPreview fixtures passed');
