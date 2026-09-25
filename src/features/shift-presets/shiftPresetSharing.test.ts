import { builtinShiftPresets } from './builtinShiftPresets';
import { materializeShiftPreset } from './shiftPreset';
import { normalizeShiftPresetShareCode } from './shiftPresetShareCode';
import { createShiftPresetSnapshot } from './shiftPresetSnapshot';
import { parseShiftPresetPayloadRow, serializeShiftPresetPayload } from './shiftPresetPayload';
import { createShiftPresetApplication, type ShiftPresetApplicationState } from './shiftPresetApplication';
import { getShiftForDate } from '../shifts/shiftSchedule';
import { getTeamStatusesForDate } from '../shifts/teamScheduleCalculator';

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
const presetId = '11111111-1111-4111-8111-111111111111';
const asServerRow = (preset: typeof snapshot) => ({ id: presetId, name: preset.name, organization_name: preset.organizationName ?? null, payload: JSON.parse(JSON.stringify(serializeShiftPresetPayload(preset))) });
const staticShared = parseShiftPresetPayloadRow(asServerRow(snapshot), 'shared');
assert(staticShared.pattern.join(',') === snapshot.pattern.join(','), 'static share must roundtrip');
assert(staticShared.conditionalRules === undefined && staticShared.teamRotationTemplate === undefined, 'static share must not gain conditions or teams');
const legacyShared = parseShiftPresetPayloadRow({ id: presetId, name: snapshot.name, organization_name: null, payload: { shiftTypes: snapshot.shiftTypes, pattern: snapshot.pattern } }, 'shared');
assert(legacyShared.pattern.join(',') === snapshot.pattern.join(',') && legacyShared.initialPatternIndex === undefined, 'old payload must remain readable');

const empty: ShiftPresetApplicationState = { version: 2, isSetupComplete: false, shiftTypes: [], shiftPattern: [], anchorDate: '2026-09-19', anchorPatternIndex: 0, patternHistory: [], shiftDateOverrides: {} };
const staticSender = createShiftPresetApplication({ current: empty, preset: staticShared, effectiveFrom: '2026-09-19', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `static-sender-${key}` });
const staticReceiver = createShiftPresetApplication({ current: empty, preset: legacyShared, effectiveFrom: '2026-09-19', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `static-receiver-${key}` });
for (let offset = 0; offset < 14; offset++) {
  const date = new Date(Date.UTC(2026, 8, 19 + offset)).toISOString().slice(0, 10);
  assert(getShiftForDate(date, staticSender).name === getShiftForDate(date, staticReceiver).name, `${date}: static legacy share must match`);
}
const fourTeamSender = createShiftPresetApplication({ current: empty, preset: base, effectiveFrom: '2026-09-19', myTeamId: 'team-2', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `four-sender-${key}` });
const fourTeamSnapshot = createShiftPresetSnapshot({ name: '4팀 공유', shiftTypes: fourTeamSender.shiftTypes, pattern: fourTeamSender.shiftPattern, patternHistory: fourTeamSender.patternHistory });
const fourTeamShared = parseShiftPresetPayloadRow(asServerRow(fourTeamSnapshot), 'shared');
assert(fourTeamShared.teamRotationTemplate?.teams.map((team) => team.patternIndexOffset).join(',') === '0,2,1,3', 'existing four-team offsets must remain unchanged');
assert(fourTeamShared.teamPhaseFromOffset === true, 'legacy team phase metadata must remain readable');
const fourTeamReceiver = createShiftPresetApplication({ current: empty, preset: fourTeamShared, effectiveFrom: '2026-09-19', myTeamId: 'team-2', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `four-receiver-${key}` });
const fourTeamOtherReceiver = createShiftPresetApplication({ current: empty, preset: fourTeamShared, effectiveFrom: '2026-09-19', myTeamId: 'team-1', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `four-other-${key}` });
for (let offset = 0; offset < 14; offset++) {
  const date = new Date(Date.UTC(2026, 8, 19 + offset)).toISOString().slice(0, 10);
  assert(getShiftForDate(date, fourTeamSender).name === getShiftForDate(date, fourTeamReceiver).name, `${date}: four-team share must match`);
  assert(getShiftForDate(date, fourTeamSender).name === getShiftForDate(date, fourTeamOtherReceiver).name, `${date}: each selected team must start from the same personal phase`);
  const senderTeams = getTeamStatusesForDate(date, fourTeamSender);
  const receiverTeams = getTeamStatusesForDate(date, fourTeamReceiver);
  assert(senderTeams.status === 'available' && receiverTeams.status === 'available', 'four-team statuses must be available');
  assert(senderTeams.statuses.map((item) => item.shiftType.name).join(',') === receiverTeams.statuses.map((item) => item.shiftType.name).join(','), `${date}: four-team phases must roundtrip for the same team`);
}
const conditionalBase = { ...builtinShiftPresets[0], conditionalRules: [{ when: 'weekendOrHoliday' as const, baseShiftKey: 'day', resolvedShiftKey: 'rest' }] };
const conditionalSender = createShiftPresetApplication({ current: empty, preset: conditionalBase, effectiveFrom: '2026-09-19', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `conditional-sender-${key}` });
const conditionalSnapshot = createShiftPresetSnapshot({ name: '조건부 공유', shiftTypes: conditionalSender.shiftTypes, pattern: conditionalSender.shiftPattern, patternHistory: conditionalSender.patternHistory });
const conditionalShared = parseShiftPresetPayloadRow(asServerRow(conditionalSnapshot), 'shared');
assert(conditionalShared.conditionalRules?.length === 1, 'non-team conditional rules must roundtrip');
const conditionalReceiver = createShiftPresetApplication({ current: empty, preset: conditionalShared, effectiveFrom: '2026-09-19', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `conditional-receiver-${key}` });
for (let offset = 0; offset < 14; offset++) {
  const date = new Date(Date.UTC(2026, 8, 19 + offset)).toISOString().slice(0, 10);
  assert(getShiftForDate(date, conditionalSender).name === getShiftForDate(date, conditionalReceiver).name, `${date}: conditional share must match`);
}
const duty = builtinShiftPresets.find((item) => item.id === 'builtin-six-team-duty')!;
const sender = createShiftPresetApplication({ current: empty, preset: duty, effectiveFrom: '2026-09-20', myTeamId: 'team-4', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `sender-${key}` });
const dutySnapshot = createShiftPresetSnapshot({ name: '6팀 공유', shiftTypes: sender.shiftTypes, pattern: sender.shiftPattern, anchorPatternIndex: sender.anchorPatternIndex, patternHistory: sender.patternHistory, teamRotation: sender.teamRotation });
assert(dutySnapshot.shiftTypes.length === 3 && !dutySnapshot.shiftTypes.some((type) => type.name === '후당직'), 'six-team snapshot must contain only 일·당직·휴무');
assert(dutySnapshot.conditionalRules?.length === 1 && dutySnapshot.conditionalRules[0].when === 'weekendOrHoliday', 'conditional rule must survive snapshot');
assert(dutySnapshot.teamRotationTemplate?.teams.length === 6 && dutySnapshot.teamPhaseFromOffset === true, 'six team template and legacy phase metadata must survive snapshot');
assert(dutySnapshot.initialPatternIndex === 0, 'shared preset must start at the sender’s personal first step');
assert(dutySnapshot.category === '당직형', 'source category must survive applied schedule snapshot');
const legacyDutySnapshot = createShiftPresetSnapshot({ name: '기존 6팀 공유', shiftTypes: sender.shiftTypes, pattern: sender.shiftPattern, patternHistory: sender.patternHistory.map(({ teamPhaseFromOffset: _oldMetadata, ...entry }) => entry) });
assert(legacyDutySnapshot.teamPhaseFromOffset === true && legacyDutySnapshot.initialPatternIndex === 0, 'existing history without phase metadata must preserve the personal phase');
const oldPhaseHistory = sender.patternHistory.map(({ teamPhaseFromOffset: _oldMetadata, ...entry }) => ({ ...entry, anchorPatternIndex: 2 }));
const oldPhaseSender = { ...sender, anchorPatternIndex: 2, patternHistory: oldPhaseHistory };
const oldPhaseSnapshot = createShiftPresetSnapshot({ name: '이전 위상 6팀 공유', shiftTypes: oldPhaseSender.shiftTypes, pattern: oldPhaseSender.shiftPattern, patternHistory: oldPhaseHistory });
const oldPhaseReceiver = createShiftPresetApplication({ current: empty, preset: parseShiftPresetPayloadRow(asServerRow(oldPhaseSnapshot), 'shared'), effectiveFrom: '2026-09-20', myTeamId: 'team-4', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `old-phase-${key}` });
assert(oldPhaseReceiver.anchorPatternIndex === 2, 'older six-team sender phase must survive for the same team');
const oldSenderTeams = getTeamStatusesForDate('2026-09-20', oldPhaseSender);
const oldReceiverTeams = getTeamStatusesForDate('2026-09-20', oldPhaseReceiver);
assert(oldSenderTeams.status === 'available' && oldReceiverTeams.status === 'available', 'older six-team states must remain readable');
assert(oldSenderTeams.statuses.map((item) => item.shiftType.name).join(',') === oldReceiverTeams.statuses.map((item) => item.shiftType.name).join(','), 'older six-team global phase must survive sharing');
const payload = serializeShiftPresetPayload(dutySnapshot);
assert(!('anchorDate' in payload) && !('patternHistory' in payload) && !('shiftDateOverrides' in payload) && !('salary' in payload), 'private schedule data must not enter server payload');
const sharedDuty = parseShiftPresetPayloadRow(asServerRow(dutySnapshot), 'shared');
assert(JSON.stringify(sharedDuty.conditionalRules) === JSON.stringify(dutySnapshot.conditionalRules), 'conditional rule must survive JSONB roundtrip');
assert(JSON.stringify(sharedDuty.teamRotationTemplate) === JSON.stringify(dutySnapshot.teamRotationTemplate), 'team offsets must survive JSONB roundtrip');
assert(sharedDuty.category === '당직형', 'category must survive JSONB roundtrip');
const receiver = createShiftPresetApplication({ current: empty, preset: sharedDuty, effectiveFrom: '2026-09-20', myTeamId: 'team-4', createdAt: '2026-09-19T00:00:00Z', createShiftTypeId: (key) => `receiver-${key}` });
assert(receiver.anchorPatternIndex === sender.anchorPatternIndex && receiver.patternHistory[0].teamPhaseFromOffset === true, 'chosen team phase must be retained');
for (let offset = 0; offset < 14; offset++) {
  const date = new Date(Date.UTC(2026, 8, 20 + offset)).toISOString().slice(0, 10);
  const senderShift = getShiftForDate(date, sender);
  const receiverShift = getShiftForDate(date, receiver);
  assert([senderShift.name, senderShift.kind, senderShift.startTime, senderShift.endTime].join('|') === [receiverShift.name, receiverShift.kind, receiverShift.startTime, receiverShift.endTime].join('|'), `${date}: sender/receiver shift must match`);
  const senderTeams = getTeamStatusesForDate(date, sender);
  const receiverTeams = getTeamStatusesForDate(date, receiver);
  assert(senderTeams.status === 'available' && receiverTeams.status === 'available', 'team statuses must be available');
  assert(senderTeams.statuses.map((item) => `${item.patternIndex}:${item.shiftType.name}`).join(',') === receiverTeams.statuses.map((item) => `${item.patternIndex}:${item.shiftType.name}`).join(','), `${date}: six team statuses must match`);
}
console.log('shiftPresetSharing fixtures passed');
