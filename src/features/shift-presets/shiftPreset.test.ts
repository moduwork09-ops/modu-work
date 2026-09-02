import { builtinShiftPresets } from './builtinShiftPresets';
import { assertValidShiftPreset, materializeShiftPreset, type ShiftPreset } from './shiftPreset';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function expectRejected(name: string, value: unknown) { let rejected = false; try { assertValidShiftPreset(value); } catch { rejected = true; } assert(rejected, `${name} must be rejected`); }

builtinShiftPresets.forEach(assertValidShiftPreset);
const source = builtinShiftPresets[3];
assert(source, 'fixture preset must exist');
const snapshot = JSON.stringify(source);
expectRejected('missing id', { ...source, id: '' });
expectRejected('missing name', { ...source, name: '' });
expectRejected('missing shift types', { ...source, shiftTypes: [] });
expectRejected('missing pattern', { ...source, pattern: [] });
expectRejected('duplicate key', { ...source, shiftTypes: [source.shiftTypes[0], source.shiftTypes[0]] });
expectRejected('unknown pattern key', { ...source, pattern: ['missing'] });
expectRejected('invalid kind', { ...source, shiftTypes: [{ ...source.shiftTypes[0], kind: 'unknown' }] });
expectRejected('invalid work time', { ...source, shiftTypes: [{ ...source.shiftTypes[0], startTime: '25:00' }] });
expectRejected('missing work time', { ...source, shiftTypes: [{ ...source.shiftTypes[0], startTime: undefined, endTime: undefined }] });

let firstRun = 0;
const first = materializeShiftPreset(source, () => `user-shift-${++firstRun}`);
let secondRun = 100;
const second = materializeShiftPreset(source, () => `user-shift-${++secondRun}`);
assert(first.shiftTypes.every((shiftType) => !source.shiftTypes.some((item) => item.key === shiftType.id)), 'preset keys must not become user ids');
assert(new Set(first.shiftTypes.map((shiftType) => shiftType.id)).size === source.shiftTypes.length, 'every shift type must receive a unique id');
assert(first.pattern.every((id) => first.shiftTypes.some((shiftType) => shiftType.id === id)), 'pattern must map to generated ids');
const expectedIdByKey = new Map(source.shiftTypes.map((shiftType, index) => [shiftType.key, first.shiftTypes[index]?.id]));
assert(JSON.stringify(first.pattern) === JSON.stringify(source.pattern.map((key) => expectedIdByKey.get(key))), 'pattern order must map exactly to generated ids');
assert(first.shiftTypes[0]?.id !== second.shiftTypes[0]?.id, 'separate materializations may use separate user ids');
assert(first.shiftTypes.some((shiftType) => shiftType.kind === 'rest' && shiftType.startTime === undefined && shiftType.endTime === undefined), 'rest shifts must materialize without work times');
assert(JSON.stringify(source) === snapshot, 'materialization must not mutate the preset');

let silentFallbackRejected = false;
try { materializeShiftPreset({ ...source, pattern: ['missing'] } as ShiftPreset, () => 'generated'); } catch { silentFallbackRejected = true; }
assert(silentFallbackRejected, 'invalid pattern keys must not silently fall back');
let duplicateGeneratedIdRejected = false;
try { materializeShiftPreset(source, () => 'same-id'); } catch { duplicateGeneratedIdRejected = true; }
assert(duplicateGeneratedIdRejected, 'duplicate generated ids must be rejected');

console.log('shiftPreset fixtures passed');
