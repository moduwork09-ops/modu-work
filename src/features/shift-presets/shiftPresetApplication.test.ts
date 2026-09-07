import { getShiftForDate } from '../shifts/shiftSchedule';
import { builtinShiftPresets } from './builtinShiftPresets';
import { createShiftPresetApplication, persistShiftPresetApplication, type ShiftPresetApplicationState } from './shiftPresetApplication';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const preset = builtinShiftPresets[0];
assert(preset, 'fixture preset must exist');

const current: ShiftPresetApplicationState = {
  version: 2,
  isSetupComplete: true,
  shiftTypes: [
    { id: 'old-day', abbreviation: '주', name: '기존 주간', startTime: '08:00', endTime: '17:00', kind: 'work', color: '#111111', textColor: '#FFFFFF' },
    { id: 'old-rest', abbreviation: '휴', name: '기존 휴무', kind: 'rest', color: '#EEEEEE', textColor: '#111111' },
  ],
  shiftPattern: ['old-day', 'old-rest'],
  anchorDate: '2026-08-01',
  anchorPatternIndex: 0,
  patternHistory: [{ id: 'old-history', effectiveFrom: '2026-08-01', pattern: ['old-day', 'old-rest'], anchorDate: '2026-08-01', anchorPatternIndex: 0, createdAt: '2026-08-01T00:00:00.000Z' }],
  shiftDateOverrides: { '2026-08-15': { date: '2026-08-15', shiftTypeId: 'old-rest', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' } },
};

let sequence = 0;
const next = createShiftPresetApplication({ current, preset, effectiveFrom: '2026-09-01', createdAt: '2026-08-20T00:00:00.000Z', createShiftTypeId: () => `new-${++sequence}` });
assert(current.shiftTypes.every((shiftType) => next.shiftTypes.includes(shiftType)), 'existing shift types must be preserved');
assert(next.patternHistory.some((entry) => entry.id === 'old-history'), 'existing history must be preserved');
assert(next.shiftDateOverrides === current.shiftDateOverrides, 'existing overrides must be preserved');
assert(next.shiftTypes.length === current.shiftTypes.length + preset.shiftTypes.length, 'preset shift types must be appended');
assert(next.shiftPattern.every((id) => next.shiftTypes.some((shiftType) => shiftType.id === id) && id.startsWith('new-')), 'new pattern must reference generated ids');
assert(getShiftForDate('2026-08-31', next).id === getShiftForDate('2026-08-31', current).id, 'dates before effectiveFrom must remain unchanged');
assert(getShiftForDate('2026-09-01', next).id.startsWith('new-'), 'new pattern must apply from effectiveFrom');

// REGRESSION: effective-date boundary semantics

// Case 1:
// ???? 2026-08-31?? ???????.
// 2026-09-07?? ? ???? ????
// 2026-09-06??? ??? ?? ???? ????? ??.
const boundaryHistoryState: ShiftPresetApplicationState = {
  ...current,
  shiftPattern: [
    'old-day',
    'old-day',
    'old-day',
    'old-day',
    'old-day',
    'old-rest',
    'old-rest',
  ],
  anchorDate: '2026-08-31',
  anchorPatternIndex: 0,
  patternHistory: [
    current.patternHistory[0],
    {
      id: 'weekly-history-0831',
      effectiveFrom: '2026-08-31',
      pattern: [
        'old-day',
        'old-day',
        'old-day',
        'old-day',
        'old-day',
        'old-rest',
        'old-rest',
      ],
      anchorDate: '2026-08-31',
      anchorPatternIndex: 0,
      createdAt: '2026-08-31T00:00:00.000Z',
    },
  ],
};

let boundarySequence = 300;

const boundaryApplied = createShiftPresetApplication({
  current: boundaryHistoryState,
  preset,
  effectiveFrom: '2026-09-07',
  createdAt: '2026-09-07T00:00:00.000Z',
  createShiftTypeId: () => `boundary-${++boundarySequence}`,
});

assert(
  boundaryApplied.patternHistory
    .map((entry) => entry.effectiveFrom)
    .join(',') === '2026-08-01,2026-08-31,2026-09-07',
  'future application must preserve all history before effectiveFrom',
);

assert(
  getShiftForDate('2026-09-06', boundaryApplied).id === 'old-rest',
  'the day before effectiveFrom must still use the previous schedule',
);

assert(
  getShiftForDate('2026-09-07', boundaryApplied).id.startsWith('boundary-'),
  'the new schedule must start exactly on effectiveFrom',
);


// Case 2:
// ?? 8/31, 9/4, 9/7 ?? ??? ?????
// ???? ?? 8/3?? ? ??? ?????
// 8/3 ??? ?? ?? ??? ?? ????? ??.
const rewriteHistoryState: ShiftPresetApplicationState = {
  ...boundaryHistoryState,
  patternHistory: [
    current.patternHistory[0],
    boundaryHistoryState.patternHistory[1],
    {
      id: 'future-history-0904',
      effectiveFrom: '2026-09-04',
      pattern: ['old-day', 'old-rest'],
      anchorDate: '2026-09-04',
      anchorPatternIndex: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
    },
    {
      id: 'future-history-0907',
      effectiveFrom: '2026-09-07',
      pattern: ['old-rest', 'old-day'],
      anchorDate: '2026-09-07',
      anchorPatternIndex: 0,
      createdAt: '2026-09-07T00:00:00.000Z',
    },
  ],
};

let rewriteSequence = 400;

const rewrittenFromAug3 = createShiftPresetApplication({
  current: rewriteHistoryState,
  preset,
  effectiveFrom: '2026-08-03',
  createdAt: '2026-09-07T00:00:00.000Z',
  createShiftTypeId: () => `rewrite-${++rewriteSequence}`,
});

assert(
  rewrittenFromAug3.patternHistory
    .map((entry) => entry.effectiveFrom)
    .join(',') === '2026-08-01,2026-08-03',
  'past-date application must discard same-date and all future history entries',
);

assert(
  getShiftForDate('2026-08-02', rewrittenFromAug3).id
    === getShiftForDate('2026-08-02', rewriteHistoryState).id,
  'dates before the rewritten effectiveFrom must remain unchanged',
);

assert(
  getShiftForDate('2026-08-03', rewrittenFromAug3).id.startsWith('rewrite-'),
  'rewritten schedule must start exactly on the selected past date',
);

assert(
  getShiftForDate('2026-09-01', rewrittenFromAug3).id.startsWith('rewrite-'),
  'discarded future history must not become active again later',
);


const currentWithFutureHistory: ShiftPresetApplicationState = {
  ...current,
  patternHistory: [
    current.patternHistory[0],
    {
      id: 'future-0831',
      effectiveFrom: '2026-08-31',
      pattern: ['old-day', 'old-day', 'old-day', 'old-day', 'old-day', 'old-rest', 'old-rest'],
      anchorDate: '2026-08-31',
      anchorPatternIndex: 0,
      createdAt: '2026-08-31T00:00:00.000Z',
    },
    {
      id: 'future-0904',
      effectiveFrom: '2026-09-04',
      pattern: ['old-day', 'old-rest'],
      anchorDate: '2026-09-04',
      anchorPatternIndex: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
    },
    {
      id: 'future-0907',
      effectiveFrom: '2026-09-07',
      pattern: ['old-day', 'old-rest'],
      anchorDate: '2026-09-07',
      anchorPatternIndex: 0,
      createdAt: '2026-09-07T00:00:00.000Z',
    },
  ],
};

let pastRewriteSequence = 200;
const rewrittenFromPast = createShiftPresetApplication({
  current: currentWithFutureHistory,
  preset,
  effectiveFrom: '2026-08-03',
  createdAt: '2026-09-07T00:00:00.000Z',
  createShiftTypeId: () => `rewrite-${++pastRewriteSequence}`,
});

assert(
  rewrittenFromPast.patternHistory.map((entry) => entry.effectiveFrom).join(',') === '2026-08-01,2026-08-03',
  'applying a new pattern from a past date must discard same-date and future history entries',
);


let secondSequence = 100;
const reapplied = createShiftPresetApplication({ current: next, preset, effectiveFrom: '2026-10-01', createdAt: '2026-09-20T00:00:00.000Z', createShiftTypeId: () => `new-${++secondSequence}` });
const firstIds = new Set(next.shiftTypes.map((shiftType) => shiftType.id));
assert(reapplied.shiftTypes.slice(next.shiftTypes.length).every((shiftType) => !firstIds.has(shiftType.id)), 'reapplication must not reuse ids');

let invalidRejected = false;
try { createShiftPresetApplication({ current, preset: { ...preset, pattern: ['missing'] }, effectiveFrom: '2026-09-01', createdAt: '2026-08-20T00:00:00.000Z', createShiftTypeId: () => 'unused' }); } catch { invalidRejected = true; }
assert(invalidRejected, 'invalid preset must fail without fallback');

const rotatingPreset = builtinShiftPresets.find((item) => item.id === 'builtin-day-night-off-rest-example');
assert(rotatingPreset, 'rotating preset fixture must exist');
const rotating = createShiftPresetApplication({ current, preset: rotatingPreset, effectiveFrom: '2026-09-01', myTeamId: 'team-2', createdAt: '2026-08-20T00:00:00.000Z', createShiftTypeId: (_key, index) => `team-shift-${index}` });
assert(rotating.patternHistory.at(-1)?.teamRotation?.myTeamId === 'team-2', 'supported preset must persist the explicit team choice');
assert(rotating.patternHistory.at(-1)?.teamRotation?.teams.map((team) => team.patternIndexOffset).join(',') === '0,2,1,3', 'supported preset must preserve confirmed offsets');
let missingTeamRejected = false;
try { createShiftPresetApplication({ current, preset: rotatingPreset, effectiveFrom: '2026-09-01', createdAt: '2026-08-20T00:00:00.000Z', createShiftTypeId: (_key, index) => `missing-team-${index}` }); } catch { missingTeamRejected = true; }
assert(missingTeamRejected, 'supported preset must require an explicit team choice');

async function runPersistenceFixture() {
  let persistedShiftTypeCount = 0;
  const failed = await persistShiftPresetApplication({
    current,
    preset,
    effectiveFrom: '2026-09-01',
    createdAt: '2026-08-20T00:00:00.000Z',
    createShiftTypeId: (_key, index) => `failed-${index}`,
    persist: async (settings) => { persistedShiftTypeCount = settings.shiftTypes.length; return false; },
  });
  assert(failed === null, 'persistence failure must not expose partial next state');
  assert(persistedShiftTypeCount === current.shiftTypes.length + preset.shiftTypes.length, 'persistence must receive the complete state in one call');
  assert(current.shiftTypes.length === 2 && current.patternHistory.length === 1, 'persistence failure must not mutate current state');
}

void runPersistenceFixture().then(() => console.log('shiftPresetApplication fixtures passed'));
