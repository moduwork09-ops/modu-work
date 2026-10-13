const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { createTravelRecommendations } = require('./travelRecommendation.ts');
const { createSharedEventIsoRangeAcrossDates } = require('./sharedEventDateTime.ts');
const { createSharedEventRpcArgs } = require('./sharedEventContract.ts');
const { addLocalCalendarDays } = require('./dayOffProjection.ts');
const spaceA = '22222222-2222-4222-8222-222222222222';
const spaceB = '33333333-3333-4333-8333-333333333333';
const start = '2026-10-20';
const full = (count) => Array.from({ length: count }, (_, index) => ({
  localDate: addLocalCalendarDays(start, index),
  availabilityStatus: 'ready', timezoneName: 'Asia/Seoul',
  intervals: [{ startMinute: 0, endMinute: 1440 }],
}));
const day = (date) => full(5).find((item) => item.localDate === date);
const iso = (date, time, endDate = date, endTime = '24:00') =>
  createSharedEventIsoRangeAcrossDates(date, endDate, { startTime: time, endTime }, 'Asia/Seoul');

for (const nights of [1, 2, 3]) {
  const result = createTravelRecommendations(spaceA, full(6), [], nights);
  assert.equal(result.status, 'ready');
  assert.ok(result.recommendations.length > 0, nights + ' nights found');
  assert.ok(result.recommendations.every((item) => item.nights === nights));
  assert.ok(result.recommendations.every((item) => item.durationMinutes >= nights * 1440 + 180));
  assert.deepEqual(result, createTravelRecommendations(spaceA, full(6), [], nights), 'deterministic ranking');
}
const work = full(4);
work[1].intervals = [{ startMinute: 0, endMinute: 480 }, { startMinute: 1080, endMinute: 1440 }];
assert.ok(!createTravelRecommendations(spaceA, work, [], 1).recommendations.some((item) => item.startDate === start), 'member work excludes crossing');
const overnight = full(3);
overnight[0].intervals = [{ startMinute: 0, endMinute: 1140 }];
overnight[1].intervals = [{ startMinute: 540, endMinute: 1440 }];
assert.ok(!createTravelRecommendations(spaceA, overnight, [], 1).recommendations.some((item) => item.startDate === start), 'overnight work blocks affected departure');
const postWork = full(3);
postWork[0].intervals = [{ startMinute: 540, endMinute: 1440 }];
assert.ok(createTravelRecommendations(spaceA, postWork, [], 1).recommendations.length > 0, 'post-work long free span qualifies');
const personalBusy = full(3);
personalBusy[1].intervals = [{ startMinute: 0, endMinute: 600 }, { startMinute: 660, endMinute: 1440 }];
assert.ok(!createTravelRecommendations(spaceA, personalBusy, [], 1).recommendations.some((item) => item.startDate === start), 'personal busy interval splits trip');
const shared = [{ spaceId: spaceA, startsAt: iso(addLocalCalendarDays(start, 1), '10:00', addLocalCalendarDays(start, 1), '11:00').startsAt,
  endsAt: iso(addLocalCalendarDays(start, 1), '10:00', addLocalCalendarDays(start, 1), '11:00').endsAt }];
assert.ok(!createTravelRecommendations(spaceA, full(3), shared, 1).recommendations.some((item) => item.startDate === start), 'shared event splits trip');
assert.ok(createTravelRecommendations(spaceA, full(3), shared.map((event) => ({ ...event, spaceId: spaceB })), 1).recommendations.length > 0, 'other space event ignored');
const shortMidnight = full(2);
shortMidnight[0].intervals = [{ startMinute: 1380, endMinute: 1440 }];
shortMidnight[1].intervals = [{ startMinute: 0, endMinute: 60 }];
assert.equal(createTravelRecommendations(spaceA, shortMidnight, [], 1).recommendations.length, 0, 'short midnight crossing is not a stay');
for (const horizon of [30, 60, 90]) {
  assert.equal(createTravelRecommendations(spaceA, full(horizon), [], 3).status, 'ready', horizon + ' day search');
}
const unavailable = full(4);
unavailable[2] = { ...day(addLocalCalendarDays(start, 2)), availabilityStatus: 'not_synced', timezoneName: null, intervals: [] };
assert.equal(createTravelRecommendations(spaceA, unavailable, [], 1).status, 'not_synced', 'incomplete group blocked');
assert.deepEqual(createSharedEventIsoRangeAcrossDates('2026-10-20', '2026-10-22',
  { startTime: '09:00', endTime: '18:00' }, 'Asia/Seoul'),
  { startsAt: '2026-10-20T00:00:00.000Z', endsAt: '2026-10-22T09:00:00.000Z' },
  'multi-day shared event uses local timezone and actual end date');
const recommendation = createTravelRecommendations(spaceA, full(3), [], 1).recommendations[0];
assert.equal(createSharedEventRpcArgs({ spaceId: recommendation.spaceId, title: '여행',
  startsAt: recommendation.startsAt, endsAt: recommendation.endsAt, participantUserIds: [],
}).p_space_id, spaceA, 'existing create RPC receives chosen space');
console.log('travel recommendation fixtures passed');
