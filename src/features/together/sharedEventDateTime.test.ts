import assert from 'node:assert/strict';

import { createSharedEventIsoRange } from './sharedEventDateTime';

assert.deepEqual(
  createSharedEventIsoRange('2026-08-29', { startTime: '18:00', endTime: '20:00' }, 'Asia/Seoul'),
  { startsAt: '2026-08-29T09:00:00.000Z', endsAt: '2026-08-29T11:00:00.000Z' },
);
assert.deepEqual(
  createSharedEventIsoRange('2026-08-29', { startTime: '23:00', endTime: '24:00' }, 'Asia/Seoul'),
  { startsAt: '2026-08-29T14:00:00.000Z', endsAt: '2026-08-29T15:00:00.000Z' },
);
assert.throws(() => createSharedEventIsoRange('bad', { startTime: '18:00', endTime: '20:00' }, 'Asia/Seoul'));
assert.throws(() => createSharedEventIsoRange('2026-08-29', { startTime: '20:00', endTime: '18:00' }, 'Asia/Seoul'));
assert.throws(() => createSharedEventIsoRange('2026-08-29', { startTime: '18:00', endTime: '20:00' }, 'Bad/Timezone'));

console.log('sharedEventDateTime fixtures passed');
