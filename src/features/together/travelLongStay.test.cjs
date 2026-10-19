const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { addLocalCalendarDays } = require('./dayOffProjection.ts');
const { createTravelLeaveRecommendations } = require('./travelLeaveSimulation.ts');
const { createTravelRecommendations, isTravelNights, MAX_TRAVEL_NIGHTS } = require('./travelRecommendation.ts');
const { createTravelEventPrefill, parseTravelCandidate, rankTravelDestinations } = require('./travelDestinationRecommendation.ts');
const { createSharedEventIsoRangeAcrossDates } = require('./sharedEventDateTime.ts');
const { createSharedEventCalendarItems } = require('./sharedEventCalendarPresentation.ts');

const base = '2026-10-20';
const spaceId = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const date = (offset) => addLocalCalendarDays(base, offset);
const days = (count) => Array.from({ length: count }, (_, index) => date(index));
const statusDays = (count) => days(count).map((localDate) => ({
  localDate, availabilityStatus: 'ready', timezoneName: 'Asia/Seoul', intervals: [],
}));
const work = (label, startTime, endTime) => ({ label, kind: 'work', startTime, endTime });
const rest = (label = '휴') => ({ label, kind: 'rest', startTime: null, endTime: null });
const dayWork = work('주', '09:00', '18:00');

function member(userId, count, shifts = {}) {
  return { userId, displayName: userId === userA ? 'A' : 'B',
    days: [date(-1), ...days(count)].map((localDate) => {
      const shift = shifts[localDate] ?? rest();
      return { localDate, sharingEnabled: true, hasProjection: true,
        shiftName: shift.label, shiftKind: shift.kind,
        startTime: shift.startTime, endTime: shift.endTime };
    }) };
}
function search(count, nights, a, b, budgets = {}, shared = [], personal = [], limit = 3) {
  return createTravelLeaveRecommendations(spaceId, statusDays(count), [a, b], budgets, shared, personal, nights, limit);
}
function at(result, nights, startDate = base) {
  return result.recommendations.find((item) => item.startDate === startDate && item.endDate === addLocalCalendarDays(startDate, nights));
}
function rank(a, b) {
  return a.totalLeaveDays - b.totalLeaveDays
    || (a.sharedSoftConflictCount + a.currentUserPersonalSoftConflictCount)
      - (b.sharedSoftConflictCount + b.currentUserPersonalSoftConflictCount)
    || b.durationMinutes - a.durationMinutes
    || b.returnBufferMinutes - a.returnBufferMinutes
    || b.weekendDays - a.weekendDays
    || a.startsAt.localeCompare(b.startsAt);
}

assert.equal(MAX_TRAVEL_NIGHTS, 9);
for (let nights = 1; nights <= 9; nights += 1) {
  assert.equal(isTravelNights(nights), true);
  const result = search(12, nights, member(userA, 12), member(userB, 12));
  assert.equal(result.status, 'ready');
  assert.ok(at(result, nights), `${nights}박${nights + 1}일 후보`);
  assert.equal(at(result, nights).totalLeaveDays, 0);
}
for (const invalid of [0, 10, -1, 2.5, '9']) assert.equal(isTravelNights(invalid), false);
assert.throws(() => createTravelRecommendations(spaceId, statusDays(12), [], 10), /Invalid travel request/);

// Middle-day work cannot be avoided by moving the departure/return boundary.
for (let required = 1; required <= 6; required += 1) {
  const shifts = Object.fromEntries(Array.from({ length: required }, (_, index) => [date(index + 1), dayWork]));
  const a = member(userA, 12, shifts);
  const b = member(userB, 12);
  const allowed = search(12, 9, a, b, { [userA]: Math.min(required, 5) }, [], [], Number.MAX_SAFE_INTEGER);
  const candidate = at(allowed, 9);
  if (required === 6) {
    assert.equal(candidate, undefined, 'six work shifts exceed the five-day leave cap');
    continue;
  }
  assert.ok(candidate, `${required} work shifts are removable with ${required} leave days`);
  assert.equal(candidate.totalLeaveDays, required);
  assert.deepEqual(candidate.leaveUsageByMember.map((usage) => [usage.userId, usage.shiftDate, usage.shiftLabel, usage.leaveUnits]),
    Array.from({ length: required }, (_, index) => [userA, date(index + 1), '주', 1]));
  const insufficient = search(12, 9, a, b, { [userA]: required - 1 }, [], [], Number.MAX_SAFE_INTEGER);
  assert.equal(at(insufficient, 9), undefined);
}

const oneEach = search(12, 9,
  member(userA, 12, { [date(2)]: dayWork }),
  member(userB, 12, { [date(3)]: work('야', '19:00', '09:00') }),
  { [userA]: 1, [userB]: 1 }, [], [], Number.MAX_SAFE_INTEGER);
assert.deepEqual(at(oneEach, 9).leaveUsageByMember.map((usage) => [usage.userId, usage.shiftDate]),
  [[userA, date(2)], [userB, date(3)]], 'each member uses their own budget');
assert.equal(at(search(12, 9, member(userA, 12, { [date(2)]: dayWork }),
  member(userB, 12, { [date(3)]: work('야', '19:00', '09:00') }), { [userA]: 1 }, [], [], Number.MAX_SAFE_INTEGER), 9), undefined);

for (const overnight of [work('야', '19:00', '09:00'), work('심', '23:00', '07:00'), work('당', '09:00', '09:00')]) {
  const a = member(userA, 12, { [date(2)]: overnight });
  assert.equal(at(search(12, 9, a, member(userB, 12), {}, [], [], Number.MAX_SAFE_INTEGER), 9), undefined);
  const candidate = at(search(12, 9, a, member(userB, 12), { [userA]: 1 }, [], [], Number.MAX_SAFE_INTEGER), 9);
  assert.equal(candidate.totalLeaveDays, 1, `${overnight.label} remains one shift across midnight`);
  assert.deepEqual(candidate.leaveUsageByMember.map((usage) => usage.shiftDate), [date(2)]);
}

const personal = [{ date: date(3), allDay: false, startTime: '12:00', endTime: '13:00' }];
const sharedTime = createSharedEventIsoRangeAcrossDates(date(4), date(4), { startTime: '11:00', endTime: '12:00' }, 'Asia/Seoul');
const shared = [{ spaceId, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: '공동 일정', ...sharedTime }];
const soft = at(search(12, 9, member(userA, 12), member(userB, 12), {}, shared, personal, Number.MAX_SAFE_INTEGER), 9);
assert.ok(soft, 'personal/shared events warn but do not block a nine-night candidate');
assert.equal(soft.currentUserPersonalSoftConflictCount, 1);
assert.equal(soft.sharedSoftConflictCount, 1);

// Five-team fixture: 주 → 야 → 심 → 비 → 휴, starting on 2026-10-20.
const fiveTeam = [dayWork, work('야', '19:00', '09:00'), work('심', '23:00', '07:00'), rest('비'), rest('휴')];
function rotatingMember(count) {
  const shifts = Object.fromEntries([date(-1), ...days(count)].map((localDate, index) =>
    [localDate, fiveTeam[(index - 1 + fiveTeam.length) % fiveTeam.length]]));
  return member(userA, count, shifts);
}
const expectedMaxNights = [1, 3, 4, 6, 8, 9];
assert.equal(new Date(`${date(5)}T00:00:00Z`).getUTCDay(), 0, 'Sunday is not automatically a rest day');
const expectedShiftDates = [[], [date(5)], [date(5), date(6)],
  [date(5), date(6), date(7)],
  ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-14'],
  [date(5), date(6), date(7), date(10), date(11)]];
for (let budget = 0; budget <= 5; budget += 1) {
  const expectedNights = expectedMaxNights[budget];
  const longest = search(30, expectedNights, rotatingMember(30), member(userB, 30),
    { [userA]: budget }, [], [], Number.MAX_SAFE_INTEGER).recommendations[0];
  assert.ok(longest, `five-team candidate exists with ${budget} leave days`);
  if (expectedNights < 9) assert.equal(search(30, expectedNights + 1, rotatingMember(30), member(userB, 30),
    { [userA]: budget }, [], [], Number.MAX_SAFE_INTEGER).recommendations.length, 0);
  assert.equal(longest.nights, expectedMaxNights[budget], `five-team maximum with ${budget} leave days`);
  assert.deepEqual(longest.leaveUsageByMember.map((usage) => usage.shiftDate), expectedShiftDates[budget]);
  assert.ok(longest.leaveUsageByMember.every((usage) => ['주', '야', '심'].includes(usage.shiftLabel)));
}

for (const horizon of [30, 60, 90]) {
  const result = search(horizon, 9, member(userA, horizon), member(userB, horizon));
  assert.equal(result.recommendations.length, 3, `${horizon}-day horizon`);
}
const rankingA = member(userA, 30, { [date(10)]: dayWork });
const rankingB = member(userB, 30);
const rankedAll = search(30, 9, rankingA, rankingB, { [userA]: 1 }, shared, personal, Number.MAX_SAFE_INTEGER).recommendations;
const rankedTop = search(30, 9, rankingA, rankingB, { [userA]: 1 }, shared, personal).recommendations;
assert.ok(rankedAll.length > 3);
assert.deepEqual(rankedTop, rankedAll.slice(0, 3), 'TOP3 is exactly the first three of all ranked candidates');
for (let index = 1; index < rankedAll.length; index += 1) assert.ok(rank(rankedAll[index - 1], rankedAll[index]) <= 0);
assert.ok(rankedAll.every((item) => item.leaveUsageByMember.filter((usage) => usage.userId === userA).length <= 5));
assert.ok(rankedAll.some((item) => item.totalLeaveDays > rankedAll[0].totalLeaveDays), 'less leave ranks before more leave');
assert.equal(rankedAll[0].totalLeaveDays, 0);
assert.equal(rankedAll[0].sharedSoftConflictCount + rankedAll[0].currentUserPersonalSoftConflictCount, 0);
assert.ok(rankedAll.some((item) => item.totalLeaveDays === 0
  && item.sharedSoftConflictCount + item.currentUserPersonalSoftConflictCount > 0),
'soft conflicts only lower rank within equal leave usage');

const nineNight = at(search(12, 9, member(userA, 12), member(userB, 12), {}, [], [], Number.MAX_SAFE_INTEGER), 9);
assert.ok(parseTravelCandidate(JSON.parse(JSON.stringify(nineNight))), 'nine-night route roundtrip');
const destination = rankTravelDestinations(nineNight, { airport: 'ICN', accessMinutes: 60, style: 'balanced' })[0];
assert.ok(destination, 'existing destination ranking accepts a longer candidate');
const prefill = createTravelEventPrefill(nineNight, destination);
assert.equal(prefill.date, base);
assert.equal(prefill.endDate, date(9));
const period = createSharedEventIsoRangeAcrossDates(prefill.date, prefill.endDate,
  { startTime: prefill.startTime, endTime: prefill.endTime }, 'Asia/Seoul');
const calendarDays = createSharedEventCalendarItems({
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', spaceId, createdBy: userA,
  title: prefill.title, memo: prefill.memo, placeName: null, placeAddress: null,
  placeLatitude: null, placeLongitude: null, kakaoPlaceUrl: null,
  createdAt: period.startsAt, updatedAt: period.startsAt, ...period,
}, 'Asia/Seoul');
assert.deepEqual(calendarDays.map((item) => item.localDate), Array.from({ length: 10 }, (_, index) => date(index)));

const started = performance.now();
const longSearch = search(90, 9, rotatingMember(90), member(userB, 90), { [userA]: 5, [userB]: 5 });
const elapsed = Math.round(performance.now() - started);
assert.equal(longSearch.status, 'ready');
assert.ok(elapsed < 10000, `nine-night 90-day fixture took ${elapsed}ms`);
console.log(`travel long-stay fixtures passed; nine-night 90-day calculation ${elapsed}ms`);
