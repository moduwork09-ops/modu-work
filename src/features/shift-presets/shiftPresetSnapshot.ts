import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftPatternHistoryEntry } from '../shifts/shiftSettingsStorage';
import type { TeamRotationMetadata } from '../shifts/teamRotation';
import { assertValidShiftPreset, type ShiftPreset } from './shiftPreset';

export function createShiftPresetSnapshot(input: { name: string; organizationName?: string; shiftTypes: ShiftType[]; pattern: string[]; anchorPatternIndex?: number; patternHistory?: ShiftPatternHistoryEntry[]; teamRotation?: TeamRotationMetadata }): ShiftPreset {
  const name = input.name.trim();
  const organizationName = input.organizationName?.trim() || undefined;
  const latest = input.patternHistory?.reduce<ShiftPatternHistoryEntry | undefined>((chosen, entry) => !chosen || entry.effectiveFrom > chosen.effectiveFrom ? entry : chosen, undefined);
  const pattern = latest?.pattern ?? input.pattern;
  const rules = latest?.conditionalRules;
  const teamRotation = latest ? latest.teamRotation : input.teamRotation;
  const sourceById = new Map(input.shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const orderedIds = [...new Set([...pattern, ...(rules?.flatMap((rule) => [rule.baseShiftTypeId, rule.resolvedShiftTypeId]) ?? [])])];
  if (!name || orderedIds.length === 0 || orderedIds.some((id) => !sourceById.has(id))) throw new Error('Invalid preset snapshot');
  const keyById = new Map(orderedIds.map((id, index) => [id, `shift-${index + 1}`]));
  const anchorPatternIndex = latest?.anchorPatternIndex ?? input.anchorPatternIndex ?? 0;
  const myTeamOffset = teamRotation?.teams.find((team) => team.id === teamRotation.myTeamId)?.patternIndexOffset;
  if (teamRotation && myTeamOffset === undefined) throw new Error('Invalid snapshot team rotation');
  // Applying a shared preset starts the recipient's selected team at this step.
  const initialPatternIndex = anchorPatternIndex;
  const preset: ShiftPreset = {
    id: 'local-snapshot', version: 1, name, organizationName, category: latest?.presetCategory, source: 'mine',
    shiftTypes: orderedIds.map((id) => { const { id: _id, ...shiftType } = sourceById.get(id)!; return { ...shiftType, key: keyById.get(id)! }; }),
    pattern: pattern.map((id) => keyById.get(id)!),
    initialPatternIndex,
    teamRotationTemplate: teamRotation ? { version: 1, teams: teamRotation.teams.map((team) => ({ ...team })) } : undefined,
    teamPhaseFromOffset: teamRotation ? true : undefined,
    conditionalRules: rules?.map((rule) => ({ when: rule.when, baseShiftKey: keyById.get(rule.baseShiftTypeId)!, resolvedShiftKey: keyById.get(rule.resolvedShiftTypeId)! })),
  };
  assertValidShiftPreset(preset);
  return preset;
}
