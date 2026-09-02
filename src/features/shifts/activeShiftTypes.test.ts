import { builtinShiftPresets } from '../shift-presets/builtinShiftPresets';
import { createShiftPresetApplication, type ShiftPresetApplicationState } from '../shift-presets/shiftPresetApplication';
import { selectActiveShiftTypes, selectEditableShiftTypes } from './activeShiftTypes';
import { getShiftForDate } from './shiftSchedule';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const preset = builtinShiftPresets[3];
const oldTypes = preset.shiftTypes.map(({ key, ...type }) => ({ ...type, id: `old-${key}` }));
const oldPattern = preset.pattern.map((key) => `old-${key}`);
const current: ShiftPresetApplicationState = {
  version: 2, isSetupComplete: true, shiftTypes: oldTypes, shiftPattern: oldPattern,
  anchorDate: '2026-08-01', anchorPatternIndex: 0,
  patternHistory: [{ id: 'old', effectiveFrom: '2026-08-01', pattern: oldPattern, anchorDate: '2026-08-01', anchorPatternIndex: 0, createdAt: '2026-08-01T00:00:00Z' }],
  shiftDateOverrides: { '2026-08-15': { date: '2026-08-15', shiftTypeId: oldTypes[0].id, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } },
};
assert(selectActiveShiftTypes(current).length === oldTypes.length, 'existing schedule must show existing types');
const next = createShiftPresetApplication({ current, preset, effectiveFrom: '2026-10-01', createdAt: '2026-09-02T00:00:00Z', createShiftTypeId: (key) => `new-${key}` });
const beforeSelection = JSON.stringify(next);
const active = selectActiveShiftTypes(next);
assert(active.length === preset.shiftTypes.length && active.every((type) => type.id.startsWith('new-')), 'future preset must show only its ID set');
assert(active[0].name === oldTypes[0].name && active[0].abbreviation === oldTypes[0].abbreviation && active[0].id !== oldTypes[0].id, 'same names and abbreviations must remain distinct by ID');
assert(JSON.stringify(next) === beforeSelection, 'selector must not mutate state/history/overrides');
assert(oldTypes.every((type) => next.shiftTypes.includes(type)), 'historical types must remain in persisted application state');
assert(next.shiftDateOverrides === current.shiftDateOverrides && next.patternHistory.includes(current.patternHistory[0]), 'history and overrides must be preserved');
for (const date of ['2026-08-01', '2026-08-15', '2026-09-30']) {
  assert(getShiftForDate(date, current).id === getShiftForDate(date, next).id, `past result changed for ${date}`);
}
assert(getShiftForDate('2026-10-01', next).id === 'new-day', 'effective date must use new types');
const unsorted = { ...next, shiftPattern: oldPattern, patternHistory: [...next.patternHistory].reverse() };
assert(selectActiveShiftTypes(unsorted).every((type) => type.id.startsWith('new-')), 'latest effective date must win regardless of history order or root pattern');
assert(selectActiveShiftTypes({ ...next, isSetupFlow: true }) === next.shiftTypes, 'direct setup must retain full editable list');
assert(selectActiveShiftTypes({ ...current, patternHistory: [] }).length === oldTypes.length, 'legacy root pattern must remain usable');
assert(selectActiveShiftTypes({ ...current, patternHistory: [], shiftPattern: [] }) === current.shiftTypes, 'draft without a pattern must retain all types');
console.log('activeShiftTypes fixtures passed');

const repeated = createShiftPresetApplication({ current: next, preset, effectiveFrom: '2026-11-01', createdAt: '2026-09-02T01:00:00Z', createShiftTypeId: (key) => `latest-${key}` });
const custom = { ...oldTypes[0], id: 'custom-shift-1788300000000' };
const overrideOnly = { ...oldTypes[0], id: 'override-only' };
const editorState = {
  ...repeated,
  shiftTypes: [...repeated.shiftTypes, custom, overrideOnly],
  shiftDateOverrides: { ...repeated.shiftDateOverrides, '2026-08-16': { ...current.shiftDateOverrides['2026-08-15'], date: '2026-08-16', shiftTypeId: overrideOnly.id } },
};
const editorSnapshot = JSON.stringify(editorState);
const editable = selectEditableShiftTypes(editorState);
assert(editable.length === preset.shiftTypes.length + 1, 'editor must show one latest set plus unused addition');
assert(editable.every((type) => type.id.startsWith('latest-') || type.id === custom.id), 'history-only and override-only IDs must be hidden');
assert(editable.includes(custom), 'unused addition with an identical name must remain selectable');
assert(selectActiveShiftTypes(editorState).every((type) => type.id.startsWith('latest-')), 'management must still show only latest set');
assert(JSON.stringify(editorState) === editorSnapshot, 'editor selection must not mutate any persisted data');
assert(editorState.shiftTypes.includes(overrideOnly) && oldTypes.every((type) => editorState.shiftTypes.includes(type)), 'hidden types must remain stored');
assert(getShiftForDate('2026-08-16', editorState).id === overrideOnly.id, 'hidden override type must still calculate');
assert(getShiftForDate('2026-09-30', editorState).id === getShiftForDate('2026-09-30', current).id, 'past schedule must survive repeated preset applications');
assert(getShiftForDate('2026-10-01', editorState).id === 'new-day' && getShiftForDate('2026-11-01', editorState).id === 'latest-day', 'both scheduled effective dates must still calculate');
const draft = { shiftTypes: [...oldTypes, custom], shiftPattern: [], patternHistory: [], shiftDateOverrides: {} };
assert(selectEditableShiftTypes(draft).length === draft.shiftTypes.length, 'direct setup must show all unreferenced draft types');
assert(selectEditableShiftTypes({ ...draft, shiftPattern: oldPattern }).includes(custom), 'legacy root pattern must not hide a new addition');
console.log('editableShiftTypes fixtures passed');

// Replacing the same effective date removes a history reference, not the stored types.
const once = createShiftPresetApplication({ current, preset, effectiveFrom: '2026-10-01', createdAt: '2026-09-02T00:00:00Z', createShiftTypeId: (_key, i) => `preset-shift-00000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
const sameDate = createShiftPresetApplication({ current: once, preset, effectiveFrom: '2026-10-01', createdAt: '2026-09-02T01:00:00Z', createShiftTypeId: (_key, i) => `preset-shift-11111111-1111-4111-8111-${String(i).padStart(12, '0')}` });
const later = createShiftPresetApplication({ current: sameDate, preset, effectiveFrom: '2026-12-01', createdAt: '2026-09-02T02:00:00Z', createShiftTypeId: (_key, i) => `preset-shift-22222222-2222-4222-8222-${String(i).padStart(12, '0')}` });
for (const schedule of [once, sameDate, later]) {
  const snapshot = JSON.stringify(schedule);
  const ids = new Set(schedule.shiftPattern);
  const shown = selectEditableShiftTypes(schedule);
  assert(shown.length === ids.size && shown.every((type) => ids.has(type.id)), 'one, same-date and later applications must show only the latest set');
  assert(JSON.stringify(schedule) === snapshot, 'orphan selection must not change persisted state');
  assert(getShiftForDate('2026-09-30', schedule).id === getShiftForDate('2026-09-30', current).id, 'old date results must remain unchanged');
}
const salaryReferencedId = once.shiftPattern[0];
assert(later.shiftTypes.some((type) => type.id === salaryReferencedId), 'an orphan ID potentially referenced by salary must not be deleted');
assert(!selectEditableShiftTypes(later).some((type) => type.id === salaryReferencedId), 'orphan preset ID must be hidden');
const unknownUnused = { ...custom, id: 'unknown-unused' };
const withPending = { ...later, shiftTypes: [...later.shiftTypes, custom, unknownUnused] };
assert(selectEditableShiftTypes(withPending).includes(custom), 'manual timestamp ID must remain editable');
assert(!selectEditableShiftTypes(withPending).includes(unknownUnused), 'unknown unreferenced provenance must not count as manual');
const usedManual = { ...withPending, patternHistory: [...withPending.patternHistory, { ...current.patternHistory[0], id: 'manual-history', pattern: [custom.id] }] };
assert(!selectEditableShiftTypes(usedManual).includes(custom), 'historical manual type must not count as pending');
console.log('orphan preset regression fixtures passed');
