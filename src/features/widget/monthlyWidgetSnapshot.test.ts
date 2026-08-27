import { strict as assert } from 'node:assert';
import { createMonthlyWidgetSnapshot } from './monthlyWidgetSnapshot';

const shiftTypes = [
  { id: 'custom', abbreviation: '긴근무이름', name: '사용자 정의 근무', startTime: '09:00', endTime: '18:00', kind: 'work' as const, color: '#ABCDEF', textColor: '#123456' },
  { id: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest' as const, color: '#EEEEEE', textColor: '#333333' },
];
const snapshot = createMonthlyWidgetSnapshot({
  shiftTypes,
  shiftPattern: ['custom', 'rest'],
  anchorDate: '2026-08-01',
  anchorPatternIndex: 0,
  patternHistory: [],
  shiftDateOverrides: {},
  dateMemos: {
    '2026-08-27': [{ id: 'm1', text: '아주 긴 메모 내용도 snapshot 원문은 안전하게 유지됩니다.', color: '#FFF1A8', timeEnabled: false, allDay: true, startTime: null, endTime: null, reminderMinutes: null, notificationId: null }],
    '2026-08-28': [{ id: 'm2', text: '등원', color: '#AABBCC', timeEnabled: true, allDay: false, startTime: '11:00', endTime: '12:00', reminderMinutes: null, notificationId: null }],
  },
  personalEvents: [
    { id: 'e2', title: '두 번째 일정', date: '2026-08-27', allDay: false, startTime: '20:30', endTime: '21:00', memo: '' },
    { id: 'e1', title: '병원', date: '2026-08-27', allDay: false, startTime: '18:00', endTime: '19:00', memo: '' },
    { id: 'e3', title: '세 번째 일정', date: '2026-08-27', allDay: true, startTime: null, endTime: null, memo: '' },
    { id: 'e4', title: '병원', date: '2026-08-28', allDay: false, startTime: '18:00', endTime: '20:00', memo: '', color: '#123456' },
  ],
}, new Date(2026, 7, 27, 12));

assert.equal(snapshot.months.length, 25);
assert.equal(snapshot.months.every((month) => month.cells.length === 42), true);
assert.equal(snapshot.months[12].cells.some((cell) => !cell.inMonth), true);
assert.equal(snapshot.months[12].cells.filter((cell) => cell.isToday).length, 1);
assert.equal(snapshot.months[12].cells.some((cell) => cell.shift.abbreviation === '긴근무이름'), true);
const todayCell = snapshot.months[12].cells.find((cell) => cell.date === '2026-08-27');
assert.deepEqual(todayCell?.infoRows.map((row) => row.text), ['종일 세 번째 일정', '아주 긴 메모 내용도 snapshot 원문은 안전하게 유지됩니다. +2']);
assert.equal(todayCell?.infoRows.length, 2);
const timedEventCell = snapshot.months[12].cells.find((cell) => cell.date === '2026-08-28');
assert.equal(timedEventCell?.infoRows[0]?.text, '18:00 병원');
assert.equal(timedEventCell?.infoRows[0]?.backgroundColor, '#123456');
assert.equal(timedEventCell?.infoRows[1]?.text, '11:00 등원');
assert.equal(timedEventCell?.infoRows[1]?.kind, 'memo');
assert.equal(snapshot.months[11].label, '2026년 7월');
assert.equal(snapshot.months[13].label, '2026년 9월');

const yearBoundary = createMonthlyWidgetSnapshot({ shiftTypes, shiftPattern: ['custom'], anchorDate: '2026-12-01', anchorPatternIndex: 0, patternHistory: [], shiftDateOverrides: {}, dateMemos: {}, personalEvents: [] }, new Date(2026, 11, 31));
assert.equal(yearBoundary.months[13].label, '2027년 1월');
assert.equal(yearBoundary.months[12].cells.every((cell) => cell.infoRows.length === 0), true);
console.log('monthlyWidgetSnapshot fixtures passed');
