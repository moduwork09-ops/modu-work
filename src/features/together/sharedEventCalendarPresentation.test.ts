import assert from 'node:assert/strict';

import { createSharedEventCalendarItem, createSharedEventCalendarItems } from './sharedEventCalendarPresentation';
import type { SharedEvent } from './sharedEventContract';

const id = '10000000-0000-4000-8000-000000000001';
const event: SharedEvent = {
  id,
  spaceId: '20000000-0000-4000-8000-000000000002',
  createdBy: '30000000-0000-4000-8000-000000000003',
  title: '저녁 식사',
  memo: null,
  startsAt: '2026-08-29T09:00:00.000Z',
  endsAt: '2026-08-29T11:00:00.000Z',
  placeName: '식당',
  placeAddress: null,
  placeLatitude: null,
  placeLongitude: null,
  kakaoPlaceUrl: null,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

assert.deepEqual(createSharedEventCalendarItem(event, 'Asia/Seoul'), {
  source: 'shared',
  id,
  spaceId: event.spaceId,
  displayKey: `shared-${id}`,
  localDate: '2026-08-29',
  title: '저녁 식사',
  startTime: '18:00',
  endTime: '20:00',
  placeName: '식당',
});
assert.equal(createSharedEventCalendarItem(event, 'UTC').startTime, '09:00');
assert.throws(() => createSharedEventCalendarItem(event, 'Bad/Timezone'));

const trip = createSharedEventCalendarItems({
  ...event, title: '여행',
  startsAt: '2026-10-20T00:00:00.000Z',
  endsAt: '2026-10-22T09:00:00.000Z',
}, 'Asia/Seoul');
assert.deepEqual(trip.map((item) => item.localDate), ['2026-10-20', '2026-10-21', '2026-10-22']);
assert.deepEqual(trip.map((item) => [item.startTime, item.endTime]),
  [['09:00', '24:00'], ['00:00', '24:00'], ['00:00', '18:00']]);
assert.equal(new Set(trip.map((item) => item.displayKey)).size, 3, 'per-day React keys are unique');
const midnightEnd = createSharedEventCalendarItems({
  ...event, startsAt: '2026-10-20T10:00:00.000Z', endsAt: '2026-10-21T15:00:00.000Z',
}, 'Asia/Seoul');
assert.deepEqual(midnightEnd.map((item) => item.localDate), ['2026-10-20', '2026-10-21']);

console.log('sharedEventCalendarPresentation fixtures passed');
