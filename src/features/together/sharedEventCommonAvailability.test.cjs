const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { calculateDailyAvailabilityProjection, intersectAvailabilityIntervals } = require('./availabilityProjection.ts');
const { createAppointmentRecommendations } = require('./appointmentRecommendation.ts');
const { excludeSharedEventsFromCommonAvailability } = require('./sharedEventCommonAvailability.ts');

const space = '11111111-1111-4111-8111-111111111111';
const otherSpace = '22222222-2222-4222-8222-222222222222';
const day = (localDate, intervals = [{ startMinute: 420, endMinute: 1380 }], availabilityStatus = 'ready') => ({
  localDate, availabilityStatus, timezoneName: availabilityStatus === 'ready' ? 'Asia/Seoul' : null,
  intervals: availabilityStatus === 'ready' ? intervals : [],
});
const event = (startsAt, endsAt, spaceId = space) => ({ spaceId, startsAt, endsAt });
const exclude = (days, events) => excludeSharedEventsFromCommonAvailability(space, days, events);

// The existing member projections already remove work and personal events before intersection.
const memberA = calculateDailyAvailabilityProjection({
  date: '2026-10-20', timezoneName: 'Asia/Seoul',
  shifts: [{ date: '2026-10-20', kind: 'work', startTime: '09:00', endTime: '10:00' }],
  personalEvents: [{ date: '2026-10-20', allDay: false, startTime: '12:00', endTime: '13:00' }],
});
const memberB = calculateDailyAvailabilityProjection({
  date: '2026-10-20', timezoneName: 'Asia/Seoul', shifts: [], personalEvents: [],
});
const baseline = day('2026-10-20', intersectAvailabilityIntervals([memberA.intervals, memberB.intervals]));
assert.deepEqual(baseline.intervals, [
  { startMinute: 420, endMinute: 540 },
  { startMinute: 600, endMinute: 720 },
  { startMinute: 780, endMinute: 1380 },
]);
assert.deepEqual(exclude([baseline], []).map((item) => item.intervals), [baseline.intervals]);

const shared = event('2026-10-20T14:00:00+09:00', '2026-10-20T15:00:00+09:00');
const [withShared] = exclude([baseline], [shared]);
assert.deepEqual(withShared.intervals, [
  { startMinute: 420, endMinute: 540 },
  { startMinute: 600, endMinute: 720 },
  { startMinute: 780, endMinute: 840 },
  { startMinute: 900, endMinute: 1380 },
]);
assert.deepEqual(baseline.intervals[2], { startMinute: 780, endMinute: 1380 }, 'source projection is not mutated');
const recommendations = createAppointmentRecommendations([withShared], [{ localDate: baseline.localDate, isCommonDayOff: false }]);
assert.equal(recommendations.recommendations.some((slot) => slot.startMinute < 900 && slot.endMinute > 840), false);

// Half-open [start,end): touching a free boundary does not remove an extra minute.
assert.deepEqual(exclude([day('2026-10-20', [{ startMinute: 600, endMinute: 660 }])], [
  event('2026-10-20T09:00:00+09:00', '2026-10-20T10:00:00+09:00'),
  event('2026-10-20T11:00:00+09:00', '2026-10-20T12:00:00+09:00'),
])[0].intervals, [{ startMinute: 600, endMinute: 660 }]);
assert.deepEqual(exclude([day('2026-10-20', [{ startMinute: 600, endMinute: 660 }])], [
  event('2026-10-20T10:15:00+09:00', '2026-10-20T10:45:00+09:00'),
])[0].intervals, [], 'sub-30 minute remnants are not shown as gaps');

const multiDay = event('2026-10-20T22:00:00+09:00', '2026-10-22T10:00:00+09:00');
assert.deepEqual(exclude([day('2026-10-20'), day('2026-10-21'), day('2026-10-22')], [multiDay])
  .map((item) => item.intervals), [
    [{ startMinute: 420, endMinute: 1320 }],
    [],
    [{ startMinute: 600, endMinute: 1380 }],
  ]);
assert.deepEqual(exclude([day('2026-10-22')], [
  event('2026-10-21T22:00:00+09:00', '2026-10-22T00:00:00+09:00'),
])[0].intervals, [{ startMinute: 420, endMinute: 1380 }]);

assert.throws(() => exclude([day('2026-10-20')], [event(shared.startsAt, shared.endsAt, otherSpace)]),
  /another space/);
assert.deepEqual(exclude([day('2026-10-20', [], 'sharing_disabled')], [shared])[0],
  day('2026-10-20', [], 'sharing_disabled'));

console.log('Shared events are busy only for matching-space Together gaps; work/personal projections and boundaries remain intact.');
