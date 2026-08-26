import type { PersonalEvent } from '../events/personalEventStorage';
import { createMemoBusyEvents } from '../memos/memoBusyEvents';
import type { DateMemos } from '../memos/dateMemoStorage';
import {
  calculateDailyAvailabilityProjection,
  intersectAvailabilityIntervals,
  normalizeAvailabilityIntervals,
  type AvailabilityInterval,
} from './availabilityProjection';

const date = '2026-08-13';
const timezoneName = 'Asia/Seoul';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIntervals(
  name: string,
  actual: AvailabilityInterval[],
  expected: AvailabilityInterval[],
) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${name} failed`);
}

const interval = (startMinute: number, endMinute: number): AvailabilityInterval => ({ startMinute, endMinute });

assertIntervals('two member activity bounds', intersectAvailabilityIntervals([
  [interval(420, 1380)],
  [interval(540, 1380)],
]), [interval(540, 1380)]);

assertIntervals('event splits one member availability', intersectAvailabilityIntervals([
  [interval(420, 1380)],
  [interval(540, 840), interval(960, 1380)],
]), [interval(540, 840), interval(960, 1380)]);

assertIntervals('multiple intervals intersect deterministically', intersectAvailabilityIntervals([
  [interval(420, 600), interval(720, 900)],
  [interval(480, 780)],
]), [interval(480, 600), interval(720, 780)]);

assertIntervals('empty member availability makes the group empty', intersectAvailabilityIntervals([
  [],
  [interval(540, 1380)],
]), []);

assertIntervals('group intersection below thirty minutes is hidden', intersectAvailabilityIntervals([
  [interval(540, 600)],
  [interval(585, 600)],
]), []);

assertIntervals('three member intersection', intersectAvailabilityIntervals([
  [interval(420, 1380)],
  [interval(540, 1200)],
  [interval(600, 900)],
]), [interval(600, 900)]);

assertIntervals('touching intervals do not intersect', intersectAvailabilityIntervals([
  [interval(540, 600)],
  [interval(600, 660)],
]), []);

assertIntervals('identical intervals remain unchanged', intersectAvailabilityIntervals([
  [interval(540, 840)],
  [interval(540, 840)],
]), [interval(540, 840)]);

assertIntervals('normalization merges duplicate overlapping and adjacent intervals', normalizeAvailabilityIntervals([
  interval(720, 840),
  interval(540, 600),
  interval(540, 600),
  interval(590, 720),
]), [interval(540, 840)]);

const restProjection = calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [{ date, kind: 'rest' }],
  personalEvents: [],
});
assert(restProjection.localDate === date && restProjection.timezoneName === timezoneName, 'projection identity must be preserved');
assertIntervals('rest day without events', restProjection.intervals, [interval(420, 1380)]);

assertIntervals('morning work blocks the beginning of the day', calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [{ date, kind: 'work', startTime: '07:00', endTime: '09:00' }],
  personalEvents: [],
}).intervals, [interval(540, 1380)]);

assertIntervals('previous overnight shift spill is calculated by gapCalculator', calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [{ date: '2026-08-12', kind: 'work', startTime: '19:00', endTime: '09:00' }],
  personalEvents: [],
}).intervals, [interval(540, 1380)]);

assertIntervals('personal event splits availability', calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [],
  personalEvents: [{ date, allDay: false, startTime: '14:00', endTime: '16:00' }],
}).intervals, [interval(420, 840), interval(960, 1380)]);

const timedMemos: DateMemos = {
  [date]: [{
    id: 'timed',
    text: '시간 지정 메모',
    color: '#FFFFFF',
    timeEnabled: true,
    allDay: false,
    startTime: '11:00',
    endTime: '12:00',
    reminderMinutes: null,
    notificationId: null,
  }],
};
assertIntervals('timed memo splits availability through the existing adapter', calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [],
  personalEvents: createMemoBusyEvents(timedMemos, []),
}).intervals, [interval(420, 660), interval(720, 1380)]);

const allDayEvent: PersonalEvent = {
  id: 'all-day',
  title: '하루 종일 일정',
  date,
  allDay: true,
  startTime: null,
  endTime: null,
  memo: '',
};
assertIntervals('all-day busy event produces a trusted empty projection', calculateDailyAvailabilityProjection({
  date,
  timezoneName,
  shifts: [],
  personalEvents: createMemoBusyEvents({}, [allDayEvent]),
}).intervals, []);

let invalidIntervalRejected = false;
try {
  normalizeAvailabilityIntervals([interval(600, 600)]);
} catch {
  invalidIntervalRejected = true;
}
assert(invalidIntervalRejected, 'invalid intervals must be rejected');

// Hydration errors must be blocked by the future sync layer before calling these pure functions.
// An empty interval array is uploadable only when trusted hydrated inputs genuinely produce no gaps.

console.log('availabilityProjection fixtures passed');
