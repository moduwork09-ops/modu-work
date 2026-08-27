import { strict as assert } from 'node:assert';
import { getMemoCalendarPreview } from './memoCalendarPreview';
import type { DateMemo } from './dateMemoStorage';
import { formatDateMemoForMonthlyWidget } from '../widget/monthlyWidgetPresentation';

const memo = (id: string): DateMemo => ({ id, text: id, color: '#FFF1A8', timeEnabled: false, allDay: true, startTime: null, endTime: null, reminderMinutes: null, notificationId: null });

assert.deepEqual(getMemoCalendarPreview([]), { visible: [], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1')]), { visible: [memo('1')], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1'), memo('2')]), { visible: [memo('1'), memo('2')], remainingCount: 0 });
assert.deepEqual(getMemoCalendarPreview([memo('1'), memo('2'), memo('3'), memo('4')]), { visible: [memo('1'), memo('2')], remainingCount: 2 });

const timedMemo: DateMemo = { ...memo('timed'), text: '등원', timeEnabled: true, allDay: false, startTime: '11:00', endTime: '12:00' };
const regularMemo: DateMemo = { ...memo('regular'), text: '하원' };
const allDayMemo: DateMemo = { ...memo('all-day'), text: '휴가', timeEnabled: true, allDay: true };
assert.equal(formatDateMemoForMonthlyWidget(timedMemo), '11:00 등원');
assert.equal(formatDateMemoForMonthlyWidget(regularMemo), '하원');
assert.equal(formatDateMemoForMonthlyWidget(allDayMemo), '종일 휴가');
assert.deepEqual(
  getMemoCalendarPreview([timedMemo, regularMemo]).visible.map(formatDateMemoForMonthlyWidget),
  ['11:00 등원', '하원'],
);
const overflowPreview = getMemoCalendarPreview([timedMemo, regularMemo, allDayMemo]);
assert.deepEqual(overflowPreview.visible.map(formatDateMemoForMonthlyWidget), ['11:00 등원', '하원']);
assert.equal(overflowPreview.remainingCount, 1);
assert.ok(formatDateMemoForMonthlyWidget({ ...timedMemo, text: '서울대학교병원 장기 진료 예약' }).startsWith('11:00 '));
assert.equal(formatDateMemoForMonthlyWidget({ ...timedMemo, color: '#123456' }), '11:00 등원');
console.log('memoCalendarPreview fixtures passed');
