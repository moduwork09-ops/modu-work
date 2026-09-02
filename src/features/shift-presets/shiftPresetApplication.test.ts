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

let secondSequence = 100;
const reapplied = createShiftPresetApplication({ current: next, preset, effectiveFrom: '2026-10-01', createdAt: '2026-09-20T00:00:00.000Z', createShiftTypeId: () => `new-${++secondSequence}` });
const firstIds = new Set(next.shiftTypes.map((shiftType) => shiftType.id));
assert(reapplied.shiftTypes.slice(next.shiftTypes.length).every((shiftType) => !firstIds.has(shiftType.id)), 'reapplication must not reuse ids');

let invalidRejected = false;
try { createShiftPresetApplication({ current, preset: { ...preset, pattern: ['missing'] }, effectiveFrom: '2026-09-01', createdAt: '2026-08-20T00:00:00.000Z', createShiftTypeId: () => 'unused' }); } catch { invalidRejected = true; }
assert(invalidRejected, 'invalid preset must fail without fallback');

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
