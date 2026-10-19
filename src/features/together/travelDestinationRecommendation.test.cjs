const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { createTravelRecommendations } = require('./travelRecommendation.ts');
const { createTravelEventPrefill, parseTravelCandidate, rankTravelDestinations,
  TRAVEL_DESTINATION_POLICY } = require('./travelDestinationRecommendation.ts');
const { addLocalCalendarDays } = require('./dayOffProjection.ts');
const root = path.resolve(__dirname, '../../..');
const spaceId = '22222222-2222-4222-8222-222222222222';
const day = '2026-10-24';
const fullDays = Array.from({ length: 6 }, (_, index) => ({
  localDate: addLocalCalendarDays(day, index),
  availabilityStatus: 'ready', timezoneName: 'Asia/Seoul',
  intervals: [{ startMinute: 0, endMinute: 1440 }],
}));
const candidate = createTravelRecommendations(spaceId, fullDays, [], 2).recommendations[0];
assert(candidate, 'fixture must have a real travel candidate');
const base = { airport: 'ICN', accessMinutes: 60, style: 'balanced' };

test('one-, two-, and three-night candidates all produce at most three viable destinations', () => {
  for (const nights of [1, 2, 3]) {
    const item = createTravelRecommendations(spaceId, fullDays, [], nights).recommendations[0];
    assert(item);
    const results = rankTravelDestinations(item, base);
    assert.equal(results.length, 3);
    assert.equal(new Set(results.map((result) => result.id)).size, 3);
    assert(results.every((result) => result.stayMinutes >= nights * TRAVEL_DESTINATION_POLICY.minimumStayPerNightMinutes));
  }
});

test('style changes destination ranking without changing the free-time candidate', () => {
  const snapshot = JSON.stringify(candidate);
  const relaxed = rankTravelDestinations(candidate, { ...base, style: 'relaxed' });
  const packed = rankTravelDestinations(candidate, { ...base, style: 'packed' });
  assert.notEqual(relaxed[0].id, packed[0].id);
  assert.equal(JSON.stringify(candidate), snapshot);
  assert.deepEqual(relaxed, rankTravelDestinations(candidate, { ...base, style: 'relaxed' }), 'deterministic result');
});

test('airport access and flight estimates reduce local stay without changing return buffer', () => {
  const shorterAccess = rankTravelDestinations(candidate, { ...base, accessMinutes: 30, style: 'relaxed' });
  const longerAccess = rankTravelDestinations(candidate, { ...base, accessMinutes: 90, style: 'relaxed' });
  const first = shorterAccess.find((item) => item.id === 'fukuoka');
  const second = longerAccess.find((item) => item.id === 'fukuoka');
  assert(first && second);
  assert.equal(first.stayMinutes - second.stayMinutes, 120);
  assert.equal(first.returnBufferMinutes, candidate.returnBufferMinutes);
  assert.equal(second.returnBufferMinutes, candidate.returnBufferMinutes);
});

test('route candidate roundtrip rejects malformed dates, timezone, duration, and space', () => {
  assert.deepEqual(parseTravelCandidate(JSON.parse(JSON.stringify(candidate))), candidate);
  assert.equal(parseTravelCandidate({ ...candidate, spaceId: 'other-space' }), null);
  assert.equal(parseTravelCandidate({ ...candidate, timezoneName: 'Invalid/Timezone' }), null);
  assert.equal(parseTravelCandidate({ ...candidate, endDate: candidate.startDate }), null);
  assert.equal(parseTravelCandidate({ ...candidate, durationMinutes: candidate.durationMinutes + 60 }), null);
});

test('destination save prefill retains selected space, city title, actual interval, and editable memo', () => {
  const destination = rankTravelDestinations(candidate, base)[0];
  const prefill = createTravelEventPrefill(candidate, destination);
  assert.equal(prefill.spaceId, spaceId);
  assert.equal(prefill.title, destination.city + ' 여행');
  assert.equal(prefill.date, candidate.startDate);
  assert.equal(prefill.endDate, candidate.endDate);
  assert.equal(prefill.timezoneName, candidate.timezoneName);
  assert.equal(prefill.source, 'travel');
  assert.match(prefill.memo, /예상 현지 체류/);
  assert.match(prefill.memo, /예상 편도 비행/);
});

test('travel route and existing shared-event editor accept the destination prefill', () => {
  const first = fs.readFileSync(path.join(root, 'app/together-travel.tsx'), 'utf8');
  const second = fs.readFileSync(path.join(root, 'app/together-travel-destinations.tsx'), 'utf8');
  const form = fs.readFileSync(path.join(root, 'app/together-event-create.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
  assert.match(first, /pathname: '\/together-travel-destinations'/);
  assert.match(second, /pathname: '\/together-event-create', params: createTravelEventPrefill\(candidate, destination\)/);
  assert.match(form, /useState\(typeof params\.memo === 'string' \? params\.memo\.slice\(0, 200\) : ''\)/);
  assert.match(layout, /Stack\.Screen name="together-travel-destinations"/);
});