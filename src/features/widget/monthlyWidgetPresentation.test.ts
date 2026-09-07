import { strict as assert } from 'node:assert';
import type { PersonalEvent } from '../events/personalEventStorage';
import type { DateMemo } from '../memos/dateMemoStorage';
import type { MonthlyWidgetInfoRow } from './monthlyWidgetPresentation';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';
import { createMonthlyWidgetInfoRows, formatDateMemoForMonthlyWidget, formatPersonalEventForMonthlyWidget, limitMonthlyWidgetInfoRows } from './monthlyWidgetPresentation';

const event = (id: string, title: string, startTime: string | null, color?: string): PersonalEvent => ({
  id, title, date: '2026-08-27', allDay: startTime === null, startTime, endTime: startTime ? '23:00' : null, memo: '', color,
});
const memo = (id: string, text: string, color = '#FFF1A8'): DateMemo => ({
  id, text, color, timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null,
});
const shared = (id: string, title: string, startTime: string): SharedEventCalendarItem => ({ source: 'shared', id, displayKey: `shared-${id}`, localDate: '2026-08-27', title, startTime, endTime: '23:00', placeName: null });

assert.deepEqual(createMonthlyWidgetInfoRows([], []), []);

assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '병원', '18:00')), '18:00 병원');
assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '등원', '07:05')), '07:05 등원');
assert.equal(formatPersonalEventForMonthlyWidget(event('e1', '휴가', null)), '휴가');
assert.equal(formatPersonalEventForMonthlyWidget({ ...event('e1', '장보기', null), allDay: false }), '장보기');
assert.equal(formatDateMemoForMonthlyWidget({ ...memo('m1', '병원'), timeEnabled: true, startTime: '18:00', endTime: '20:00' }), '18:00 병원');
assert.equal(formatDateMemoForMonthlyWidget({ ...memo('m1', '행사'), timeEnabled: true, allDay: true }), '행사');
assert.equal(formatDateMemoForMonthlyWidget(memo('m1', '등원')), '등원');
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], []).map((row) => row.text), ['09:00 병원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '휴가', null)], []).map((row) => row.text), ['휴가']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '등원')]).map((row) => row.text), ['등원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], [memo('m1', '등원')]).map((row) => row.text), ['09:00 병원', '등원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00'), event('e2', '운동', '18:00')], []).map((row) => row.text), ['09:00 병원', '18:00 운동']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '등원'), memo('m2', '하원')]).map((row) => row.text), ['등원', '하원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00')], [memo('m1', '등원'), memo('m2', '하원'), memo('m3', '준비물')]).map((row) => row.text), ['09:00 병원', '등원 +2']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '병원', '09:00'), event('e2', '운동', '18:00')], [memo('m1', '등원'), memo('m2', '하원')]).map((row) => row.text), ['09:00 병원', '18:00 운동 +2']);
assert.deepEqual(createMonthlyWidgetInfoRows([], [memo('m1', '하나'), memo('m2', '둘'), memo('m3', '셋')]).map((row) => row.text), ['하나', '둘 +1']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('late', '늦게', '20:00'), event('early', '일찍', '08:00')], []).map((row) => row.text), ['08:00 일찍', '20:00 늦게']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('later', '새벽 뒤', '00:10'), event('midnight', '자정 직후', '00:01')], []).map((row) => row.text), ['00:01 자정 직후', '00:10 새벽 뒤']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('all-day', '행사', null), event('late', '저녁', '20:00'), { ...event('untimed', '장보기', null), allDay: false }, event('early', '치과', '09:30')], []).map((row) => row.text), ['09:30 치과', '20:00 저녁 +2'], 'timed events lead; all-day and untimed keep source order behind them');
assert.deepEqual(createMonthlyWidgetInfoRows([event('late', '병원', '18:00'), event('early', '등원', '07:05')], []).map((row) => row.text), ['07:05 등원', '18:00 병원']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('e1', '하나', '09:00'), event('e2', '둘', '10:00'), event('e3', '셋', '11:00')], [memo('m1', '넷'), memo('m2', '다섯')]).map((row) => row.text), ['09:00 하나', '10:00 둘 +3']);
assert.deepEqual(createMonthlyWidgetInfoRows([event('same-1', '먼저', '09:00'), event('same-2', '나중', '09:00')], []).map((row) => row.text), ['09:00 먼저', '09:00 나중'], 'equal times retain source order');
const customEvent = createMonthlyWidgetInfoRows([event('e1', '색상', '10:00', '#111111')], [])[0];
assert.equal(customEvent.dotColor, '#111111');
const customMemo = createMonthlyWidgetInfoRows([], [memo('m1', '사용자 색', '#123456')])[0];
assert.equal(customMemo.dotColor, '#8F98A3', 'memo uses a neutral dot instead of a large colored background');
assert.equal(customMemo.highlightColor, '#E8F1EC');
assert.equal(createMonthlyWidgetInfoRows([event('e1', 'legacy', '10:00')], [])[0].dotColor, '#D7DCE2');
assert.deepEqual(createMonthlyWidgetInfoRows([event('personal', '개인', '11:00')], [], [shared('together', '공동', '09:00')]).map((row) => [row.kind, row.text]), [['sharedEvent', '09:00 공동'], ['personalEvent', '11:00 개인']]);
assert.deepEqual(createMonthlyWidgetInfoRows([{ ...event('same', 'legacy 공동', '08:00'), kind: 'shared' }], [], [shared('same', '서버 공동', '09:00')]).map((row) => row.text), ['08:00 legacy 공동'], 'same shared id is deduplicated');
const overflowInput: MonthlyWidgetInfoRow[] = [
  { kind: 'personalEvent', text: '첫째', dotColor: '#FFF', highlightColor: '#EEF3F8' },
  { kind: 'memo', text: '둘째', dotColor: '#FFF', highlightColor: '#E8F1EC' },
  { kind: 'memo', text: '셋째', dotColor: '#FFF', highlightColor: '#E8F1EC' },
];
assert.deepEqual(limitMonthlyWidgetInfoRows(overflowInput).map(row => row.text), ['첫째', '둘째 +1']);
assert.equal(overflowInput[1].text, '둘째', 'overflow selection does not mutate snapshot source rows');
assert.deepEqual(limitMonthlyWidgetInfoRows(overflowInput.slice(0, 1)).map(row => row.text), ['첫째']);
assert.deepEqual(limitMonthlyWidgetInfoRows(overflowInput.slice(0, 2)).map(row => row.text), ['첫째', '둘째']);
assert.deepEqual(
  createMonthlyWidgetInfoRows([event('e1', '긴 Korean English 제목 🏥📅 렌더러에서 말줄임됩니다', '10:00')], [memo('m1', '아주 긴 memo 🚗 내용도 렌더러에서 안전하게 말줄임됩니다')]).map((row) => row.text),
  ['10:00 긴 Korean English 제목 🏥📅 렌더러에서 말줄임됩니다', '아주 긴 memo 🚗 내용도 렌더러에서 안전하게 말줄임됩니다'],
  'snapshot presentation keeps full Unicode text for measured native ellipsis',
);
console.log('monthlyWidgetPresentation fixtures passed');
