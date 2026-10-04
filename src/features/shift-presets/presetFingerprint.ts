import { assertValidShiftPreset, type PresetConditionalRule, type PresetShiftType, type ShiftPreset } from './shiftPreset';

function shiftSignature(shift: PresetShiftType) {
  return `${shift.kind}:${shift.startTime ?? '-'}:${shift.endTime ?? '-'}`;
}

function modulo(value: number, length: number) {
  return ((value % length) + length) % length;
}

/** Matches the existing first-matching-rule resolver for supported holiday dates. */
function resolvedSignature(
  base: string,
  rules: readonly PresetConditionalRule[],
  signatureByKey: Map<string, string>,
  weekend: boolean,
  holiday: boolean,
) {
  for (const rule of rules) {
    if (rule.when === 'weekend' ? weekend : (rule.when === 'weekendOrHoliday' && weekend) || holiday) {
      return signatureByKey.get(rule.resolvedShiftKey)!;
    }
  }
  return base;
}

/** ASCII-only v1 representation shared with the server migration before SHA-256. */
export function canonicalizePresetPattern(preset: ShiftPreset): string {
  assertValidShiftPreset(preset);
  const signatureByKey = new Map(preset.shiftTypes.map((shift) => [shift.key, shiftSignature(shift)]));
  const tokenByKey = new Map<string, string>();

  for (const key of new Set(preset.pattern)) {
    const base = signatureByKey.get(key)!;
    const rules = preset.conditionalRules?.filter((rule) => rule.baseShiftKey === key) ?? [];
    const ruleTokens = rules.map((rule) => `${rule.when}>${signatureByKey.get(rule.resolvedShiftKey)!}`).sort();
    // Rule order usually does not matter, but overlapping rules with different targets
    // can be order-sensitive in the current resolver. Preserve those outcomes as well.
    const outcomes = [
      resolvedSignature(base, rules, signatureByKey, false, false),
      resolvedSignature(base, rules, signatureByKey, true, false),
      resolvedSignature(base, rules, signatureByKey, false, true),
      resolvedSignature(base, rules, signatureByKey, true, true),
    ];
    tokenByKey.set(key, `${base}{${ruleTokens.join(',')}}[${outcomes.join(',')}]`);
  }

  const tokens = preset.pattern.map((key) => tokenByKey.get(key)!);
  const rotations = tokens.map((_, start) => tokens.map((__, index) => tokens[(start + index) % tokens.length]).join(';'));
  const cycle = rotations.sort()[0];
  const teams = preset.teamRotationTemplate?.teams;
  const teamOffsets = teams
    ? teams.map((team) => modulo(team.patternIndexOffset - teams[0].patternIndexOffset, tokens.length)).join(',')
    : '-';
  return `v1|cycle=${cycle}|teams=${teamOffsets}`;
}
