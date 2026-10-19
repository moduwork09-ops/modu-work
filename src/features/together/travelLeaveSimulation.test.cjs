const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { addLocalCalendarDays } = require('./dayOffProjection.ts');
const { createTravelLeaveRecommendations, selectCurrentUserTravelSoftEvents } = require('./travelLeaveSimulation.ts');
const { createTravelRecommendations } = require('./travelRecommendation.ts');
const { MAX_SIMULATED_LEAVE_DAYS, parseSimulatedLeaveDays } = require('./travelLeavePolicy.ts');
const { createTravelEventPrefill, parseTravelCandidate, rankTravelDestinations } = require('./travelDestinationRecommendation.ts');
const { calculateDailyAvailabilityProjection } = require('./availabilityProjection.ts');
const spaceId = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base = '2026-10-20';
const statusDays = (count) => Array.from({ length: count }, (_, index) => ({
  localDate: addLocalCalendarDays(base, index), availabilityStatus: 'ready', timezoneName: 'Asia/Seoul',
  intervals: [], // Existing personal-event availability is deliberately ignored by travel.
}));
const member = (userId, displayName, count, work = {}) => ({ userId, displayName,
  days: Array.from({ length: count + 1 }, (_, index) => {
    const date = addLocalCalendarDays(base, index - 1);
    const shift = work[date];
    return { localDate: date, sharingEnabled: true, hasProjection: true,
      shiftName: shift?.label ?? '휴무', shiftKind: shift ? 'work' : 'rest',
      startTime: shift?.start ?? null, endTime: shift?.end ?? null };
  }),
});
const run = (count, nights, members, budgets = {}, shared = [], personal = []) =>
  createTravelLeaveRecommendations(spaceId, statusDays(count), members, budgets, shared, personal, nights);
const on = (date, result) => result.recommendations.find((item) => item.startDate === date)
  ?? (result.extraLeaveRecommendation?.startDate === date ? result.extraLeaveRecommendation : null);

const allRest = [member(userA, 'A', 7), member(userB, 'B', 7)];
const zero = run(7, 1, allRest);
assert.equal(zero.status, 'ready');
assert.equal(zero.recommendations.length, 3);
assert.ok(zero.recommendations.every((item) => item.totalLeaveDays === 0));
assert.deepEqual(zero.recommendations.map((item) => [item.startsAt, item.endsAt]),
  createTravelRecommendations(spaceId, statusDays(7).map((day) => ({ ...day, intervals: [{ startMinute: 0, endMinute: 1440 }] })), [], 1)
    .recommendations.map((item) => [item.startsAt, item.endsAt]), 'zero leave preserves work-only travel windows');
assert.deepEqual(zero, run(7, 1, allRest), 'same input is deterministic');

const personal = [{ date: '2026-10-21', allDay: false, startTime: '12:00', endTime: '13:00' }];
const shared = [{ spaceId, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: '가족 영상통화',
  startsAt: '2026-10-21T05:00:00.000Z', endsAt: '2026-10-21T06:00:00.000Z' }];
const soft = run(3, 1, [member(userA, 'A', 3), member(userB, 'B', 3)], {}, shared, personal);
const softTrip = on(base, soft);
assert.ok(softTrip, 'personal/shared events do not remove a travel candidate');
assert.equal(softTrip.currentUserPersonalSoftConflictCount, 1);
assert.equal(softTrip.sharedSoftConflictCount, 1);
assert.deepEqual(softTrip.sharedSoftConflicts.map((item) => item.title), ['가족 영상통화']);
assert.equal(run(5, 1, [member(userA, 'A', 5), member(userB, 'B', 5)], {}, shared, personal)
  .recommendations[0].startDate, '2026-10-22', 'fewer soft conflicts win only after leave usage ties');
assert.equal(calculateDailyAvailabilityProjection({ date: '2026-10-21', timezoneName: 'Asia/Seoul',
  shifts: [], personalEvents: personal, activityStart: '00:00', activityEnd: '24:00' }).intervals.length, 2,
  'ordinary availability still treats personal events as busy');

const oneShift = [member(userA, 'A', 5, { '2026-10-21': { label: '일근', start: '09:00', end: '18:00' } }), member(userB, 'B', 5)];
assert.equal(on(base, run(5, 1, oneShift)), null, 'work remains hard busy with no leave');
const oneDay = on(base, run(5, 1, oneShift, { [userA]: 1 }));
assert.ok(oneDay, 'one overlapping work shift is removable with one day of leave');
assert.equal(oneDay.totalLeaveDays, 1);
assert.deepEqual(oneDay.leaveUsageByMember.map((item) => [item.userId, item.shiftDate, item.shiftLabel, item.leaveUnits]),
  [[userA, '2026-10-21', '일근', 1]]);
assert.equal(run(5, 1, oneShift, { [userA]: 1 }).recommendations[0].totalLeaveDays, 0,
  'lower leave use ranks first');

const twoShifts = [member(userA, 'A', 6, {
  '2026-10-21': { label: '일근', start: '09:00', end: '18:00' },
  '2026-10-22': { label: '야근', start: '09:00', end: '18:00' },
}), member(userB, 'B', 6)];
assert.equal(on(base, run(6, 2, twoShifts, { [userA]: 1 })), null, 'two shifts exceed a one-day budget');
assert.equal(on(base, run(6, 2, twoShifts, { [userA]: 2 })).totalLeaveDays, 2);
const boundaryWork = [member(userA, 'A', 5, {
  '2026-10-20': { label: '짧은 오전 근무', start: '08:00', end: '10:00' },
  '2026-10-21': { label: '일근', start: '09:00', end: '18:00' },
}), member(userB, 'B', 5)];
const boundary = on(base, run(2, 1, boundaryWork, { [userA]: 1 }));
assert.ok(boundary, 'departure can move past a shift ending inside the departure window');
assert.equal(boundary.totalLeaveDays, 1);
assert.equal(boundary.startsAt, '2026-10-20T01:00:00.000Z');

const overnight = [member(userA, 'A', 4, { '2026-10-20': { label: '야간', start: '18:00', end: '09:00' } }), member(userB, 'B', 4)];
assert.equal(on(base, run(4, 1, overnight)), null);
assert.equal(on(base, run(4, 1, overnight, { [userA]: 1 })).totalLeaveDays, 1,
  'an overnight shift costs one day, not two calendar dates');

const bothWork = [member(userA, 'A', 4, { '2026-10-21': { label: '일근', start: '09:00', end: '18:00' } }),
  member(userB, 'B', 4, { '2026-10-21': { label: '야근', start: '09:00', end: '18:00' } })];
assert.equal(on(base, run(4, 1, bothWork, { [userA]: 1 })), null);
assert.equal(on(base, run(4, 1, bothWork, { [userB]: 1 })), null);
assert.equal(on(base, run(4, 1, bothWork, { [userA]: 1, [userB]: 1 })).totalLeaveDays, 2);
assert.equal(parseSimulatedLeaveDays(4), 4);
assert.equal(parseSimulatedLeaveDays(MAX_SIMULATED_LEAVE_DAYS), 5);
assert.equal(parseSimulatedLeaveDays(6), null);
assert.equal(parseSimulatedLeaveDays(-1), null);
assert.equal(parseSimulatedLeaveDays(1.5), null);
const fourWork = [member(userA, 'A', 4, {
  '2026-10-20': { label: '오후', start: '12:00', end: '18:00' },
  '2026-10-21': { label: '일근', start: '09:00', end: '18:00' },
  '2026-10-22': { label: '일근', start: '09:00', end: '18:00' },
  '2026-10-23': { label: '일근', start: '09:00', end: '18:00' },
}), member(userB, 'B', 4)];
assert.equal(on(base, run(4, 3, fourWork, { [userA]: 4 })).totalLeaveDays, 4, 'direct four-day budget works');
const fiveWork = [member(userA, 'A', 4, {
  '2026-10-19': { label: '전날 야근', start: '18:00', end: '13:00' },
  '2026-10-20': { label: '오후', start: '12:00', end: '18:00' },
  '2026-10-21': { label: '일근', start: '09:00', end: '18:00' },
  '2026-10-22': { label: '일근', start: '09:00', end: '18:00' },
  '2026-10-23': { label: '일근', start: '09:00', end: '18:00' },
}), member(userB, 'B', 4)];
assert.equal(on(base, run(4, 3, fiveWork, { [userA]: 4 })), null, 'five shifts exceed a four-day budget');
assert.equal(on(base, run(4, 3, fiveWork, { [userA]: 5 })).totalLeaveDays, 5, 'direct five-day budget works');
const untouched = JSON.stringify(twoShifts);
run(6, 2, twoShifts, { [userA]: 2 });
assert.equal(JSON.stringify(twoShifts), untouched, 'simulation never writes shift/override data');

const selected = selectCurrentUserTravelSoftEvents([
  { id: 'private', title: '비공개 제목', date: '2026-10-21', allDay: false, startTime: '12:00', endTime: '13:00', memo: '비공개 내용' },
  { id: 'shared', title: '공동', date: '2026-10-21', allDay: true, startTime: null, endTime: null, memo: '', kind: 'shared' },
], {});
assert.equal(selected.length, 1);
assert.ok(!JSON.stringify(selected).includes('비공개'), 'private title/memo/id never enter travel metadata');
assert.equal(selectCurrentUserTravelSoftEvents([], { '2026-10-21': [
  { id: 'timed', text: '비공개 메모', timeEnabled: true, allDay: false, startTime: '11:00', endTime: '12:00' },
  { id: 'note', text: '일반 메모', timeEnabled: false, allDay: false, startTime: null, endTime: null },
] }).length, 1, 'timed personal schedule is a soft warning; plain memo is not');
const destinationCandidate = oneDay;
assert.ok(parseTravelCandidate(destinationCandidate));
assert.equal(parseTravelCandidate({ ...destinationCandidate, totalLeaveDays: 2 }), null, 'leave metadata cannot be forged inconsistently');
const destinations = rankTravelDestinations(destinationCandidate, { airport: 'ICN', accessMinutes: 60, style: 'balanced' });
assert.ok(destinations.length > 0, 'leave candidates use the existing destination ranking');
const prefill = createTravelEventPrefill(destinationCandidate, destinations[0]);
assert.equal(prefill.spaceId, spaceId);
assert.match(prefill.memo, /연가 필요/);
assert.match(prefill.memo, /A · 10\/21\(수\) 일근/);
assert.match(prefill.memo, /예상 현지 체류/);
assert.ok(prefill.memo.length <= 200);

const noShare = [member(userA, 'A', 4), member(userB, 'B', 4)];
noShare[1].days[1].sharingEnabled = false;
assert.equal(run(4, 1, noShare).status, 'sharing_disabled', 'private shift details are never guessed');
const t0 = Date.now();
for (const horizon of [30, 60, 90]) {
  assert.equal(run(horizon, 3, [member(userA, 'A', horizon), member(userB, 'B', horizon)],
    { [userA]: 5, [userB]: 5 }).status, 'ready', `${horizon}-day work-only search`);
}
console.log(`travel leave simulation fixtures passed; 30/60/90-day searches ${Date.now() - t0}ms`);
