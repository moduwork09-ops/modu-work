// @ts-ignore Node's type-stripping test runner requires explicit TypeScript extensions.
import { calculateDailyGaps } from '../gaps/gapCalculator.ts';
import type { PersonalEvent } from '../events/personalEventStorage';
// @ts-ignore Node's type-stripping test runner requires explicit TypeScript extensions.
import { createMemoBusyEvents } from './memoBusyEvents.ts';
import type { DateMemos } from './dateMemoStorage';
// @ts-ignore Node's type-stripping test runner requires explicit TypeScript extensions.
import { getMemoNotificationDate } from './memoNotificationTiming.ts';
// @ts-ignore Node's type-stripping test runner requires explicit TypeScript extensions.
import { getMemoCalendarPreview } from './memoCalendarPreview.ts';

const date = '2026-08-17';
const memos: DateMemos = {
  [date]: [
    { id: 'timed-1', text: '병원', color: '#FFF1A8', timeEnabled: true, allDay: false, startTime: '11:00', endTime: '12:00', reminderMinutes: null, notificationId: null },
    { id: 'timed-2', text: '운동', color: '#BFE7F5', timeEnabled: true, allDay: false, startTime: '16:00', endTime: '17:00', reminderMinutes: null, notificationId: null },
  ],
  '2026-08-18': [{ id: 'simple', text: '일반 일정', color: '#FFF1A8', timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null }],
  '2026-08-19': [{ id: 'all-day', text: '휴가', color: '#FFF1A8', timeEnabled: true, allDay: true, startTime: null, endTime: null, reminderMinutes: null, notificationId: null }],
};
const legacyEvents: PersonalEvent[] = [{ id: 'legacy', title: '기존 일정', date, allDay: false, startTime: '14:00', endTime: '15:00', memo: '' }];
const busyEvents = createMemoBusyEvents(memos, legacyEvents);

if (busyEvents.length !== 4) throw new Error('Simple schedules must not become busy events.');
const timedResult = calculateDailyGaps({ date, shifts: [], personalEvents: busyEvents });
if (timedResult.totalGapMinutes !== 780) throw new Error('Multiple timed schedules and legacy event were not all applied.');
const allDayResult = calculateDailyGaps({ date: '2026-08-19', shifts: [], personalEvents: busyEvents });
if (allDayResult.totalGapMinutes !== 0) throw new Error('All-day memo must block the full activity day.');
if (!getMemoNotificationDate('2099-01-01', '12:00', 10, 0)) throw new Error('Future reminder must produce a trigger date.');
if (getMemoNotificationDate('2020-01-01', '12:00', 0) !== null) throw new Error('Past reminder must be rejected.');
const preview = getMemoCalendarPreview([...memos[date], memos['2026-08-18'][0]]);
if (preview.visible.length !== 2 || preview.remainingCount !== 1) throw new Error('Monthly preview must show two schedules plus remaining count.');

console.log('memoBusyEvents tests passed');
