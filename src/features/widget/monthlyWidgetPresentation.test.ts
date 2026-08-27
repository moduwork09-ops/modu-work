import { strict as assert } from 'node:assert';
import type { PersonalEvent } from '../events/personalEventStorage';
import type { DateMemo } from '../memos/dateMemoStorage';
import { createMonthlyWidgetInfoRows, formatDateMemoForMonthlyWidget, formatPersonalEventForMonthlyWidget } from './monthlyWidgetPresentation';

const event = (id: string, title: string, startTime: string | null, color?: string): PersonalEvent => ({
  id, title, date: '2026-08-27', allDay: startTime === null, startTime, endTime: startTime ? '23:00' : null, memo: '', color,
});
const memo = (id: string, text: string, color = '#FFF1A8'): DateMemo => ({
  id, text, color, timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null,
});

assert.deepEqual(createMonthlyWidgetInfoRows([], []), []);
assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '병원', '18:00')), '18:00 병원');
assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '등원', '07:05')), '07:05 등원');
assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '휴가', null)), '종일 휴가');
assert.equal(formatDateMemoForMonthlyWidget({ ...memo('m1', '병원'), timeEnabled: true, startTime: '18:00', endTime: '20:00' }), '18:00 병원');
assert.equal(formatDateMemoForMonthlyWidget(memo('m1', '등원')), '등원');
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], []).map((row) => row.text), ['09:00 병원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '휴가', null)], []).map((row) => row.text), ['종일 휴가']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '등원')]).map((row) => row.text), ['등원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], [memo('m1', '등원')]).map((row) => row.text), ['09:00 병원', '등원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00'), event('e2', '운동', '18:00')], []).map((row) => row.text), ['09:00 병원', '18:00 운동']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '등원'), memo('m2', '하원')]).map((row) => row.text), ['등원', '하원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], [memo('m1', '등원'), memo('m2', '하원'), memo('m3', '준비물')]).map((row) => row.text), ['09:00 병원', '등원 +2']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00'), event('e2', '운동', '18:00')], [memo('m1', '등원'), memo('m2', '하원')]).map((row) => row.text), ['09:00 병원', '등원 +2']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '하나'), memo('m2', '둘'), memo('m3', '셋')]).map((row) => row.text), ['하나', '둘 +1']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('late', '늦게', '20:00'), event('early', '일찍', '08:00')], []).map((row) => row.text), ['08:00 일찍', '20:00 늦게']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('late', '병원', '18:00'), event('early', '등원', '07:05')], []).map((row) => row.text), ['07:05 등원', '18:00 병원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '하나', '09:00'), event('e2', '둘', '10:00'), event('e3', '셋', '11:00')], [memo('m1', '넷'), memo('m2', '다섯')]).map((row) => row.text), ['09:00 하나', '넷 +3']);
const customEvent = createMonthlyWidgetInfoRows([event('e1', '색상', '10:00', '#111111')], [])[0];
assert.equal(customEvent.backgroundColor, '#111111');
assert.equal(customEvent.textColor, '#FFFFFF');
const customMemo = createMonthlyWidgetInfoRows([], [memo('m1', '사용자 색', '#123456')])[0];
assert.equal(customMemo.backgroundColor, '#123456');
assert.equal(customMemo.textColor, '#FFFFFF');
assert.equal(createMonthlyWidgetInfoRows([event('e1', 'legacy', '10:00')], [])[0].backgroundColor, '#D7DCE2');
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '긴 제목이 렌더러에서 말줄임됩니다', '10:00')], [memo('m1', '아주 긴 메모도 렌더러에서 안전하게 말줄임됩니다')]).map((row) => row.kind), ['event', 'memo']);
console.log('monthlyWidgetPresentation fixtures passed');
