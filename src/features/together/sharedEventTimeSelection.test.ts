import { strict as assert } from 'node:assert';

import {
  createDefaultSharedEventTime,
  findContainingAvailabilityInterval,
  isSharedEventTimeWithinAvailability,
  sharedEventTimeToMinute,
} from './sharedEventTimeSelection';

const evening = [{ startMinute: 1080, endMinute: 1380 }];
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '18:00', endTime: '20:00' }, evening), true);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '18:30', endTime: '20:30' }, evening), true);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '18:05', endTime: '18:10' }, evening), true);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '17:30', endTime: '20:00' }, evening), false);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '22:00', endTime: '23:30' }, evening), false);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '20:00', endTime: '19:00' }, evening), false);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '20:00', endTime: '20:00' }, evening), false);

const split = [{ startMinute: 480, endMinute: 600 }, { startMinute: 1080, endMinute: 1260 }];
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '09:30', endTime: '18:30' }, split), false);
assert.equal(findContainingAvailabilityInterval({ startTime: '18:30', endTime: '20:00' }, split), 1);
assert.deepEqual(createDefaultSharedEventTime({ startMinute: 1080, endMinute: 1380 }), { startTime: '18:00', endTime: '19:00' });
assert.deepEqual(createDefaultSharedEventTime({ startMinute: 1320, endMinute: 1350 }), { startTime: '22:00', endTime: '22:30' });
assert.equal(sharedEventTimeToMinute('24:00'), 1440);
assert.equal(isSharedEventTimeWithinAvailability({ startTime: '23:00', endTime: '24:00' }, [{ startMinute: 1380, endMinute: 1440 }]), true);
assert.equal(sharedEventTimeToMinute('bad'), null);

console.log('sharedEventTimeSelection fixtures passed');
