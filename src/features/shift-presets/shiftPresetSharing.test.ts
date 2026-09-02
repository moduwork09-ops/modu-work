import { builtinShiftPresets } from './builtinShiftPresets';
import { materializeShiftPreset } from './shiftPreset';
import { normalizeShiftPresetShareCode } from './shiftPresetShareCode';
import { createShiftPresetSnapshot } from './shiftPresetSnapshot';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const base = builtinShiftPresets[3]!;
const shiftTypes = base.shiftTypes.map(({ key, ...shiftType }) => ({ ...shiftType, id: `current-${key}` }));
const idByKey = new Map(base.shiftTypes.map((item, index) => [item.key, shiftTypes[index]!.id]));
const snapshot = createShiftPresetSnapshot({ name: '공유 근무표', organizationName: '테스트 기관', shiftTypes, pattern: base.pattern.map((key) => idByKey.get(key)!) });
assert(snapshot.shiftTypes.length === shiftTypes.length && snapshot.pattern.length === base.pattern.length, 'current schedule must become a complete preset');
assert(!('anchorDate' in snapshot) && !('patternHistory' in snapshot) && !('dateOverrides' in snapshot) && !('salary' in snapshot), 'private schedule data must not enter snapshot');
assert(normalizeShiftPresetShareCode(' mw 7k-3p9q ') === 'MW-7K3P9Q', 'share code must normalize case and separators');
let nextId = 0;
const recipient = materializeShiftPreset(snapshot, () => `recipient-${++nextId}`);
assert(recipient.shiftTypes.every((item) => !shiftTypes.some((source) => source.id === item.id)), 'recipient must receive new shift type ids');
console.log('shiftPresetSharing fixtures passed');
