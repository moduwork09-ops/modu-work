import { assertValidShiftPreset, type ShiftPreset } from './shiftPreset';

export type PresetRestRuleSettings = {
  weekendEnabled: boolean;
  holidayEnabled: boolean;
  targetShiftKeys: string[];
  restShiftKey: string;
};

/** Only expose rule sets that this small editor can represent without losing information. */
export function getPresetRestRuleSettings(preset: ShiftPreset): PresetRestRuleSettings | null {
  const rules = preset.conditionalRules ?? [];
  const rest = rules.length
    ? preset.shiftTypes.find((type) => type.key === rules[0].resolvedShiftKey && type.kind === 'rest')
    : preset.shiftTypes.find((type) => type.kind === 'rest' && (type.key === 'rest' || type.abbreviation === '휴'));
  const workKeys = new Set(preset.shiftTypes.filter((type) => type.kind === 'work' && preset.pattern.includes(type.key)).map((type) => type.key));
  if (!rest || workKeys.size === 0 || rules.some((rule) => rule.resolvedShiftKey !== rest.key || !workKeys.has(rule.baseShiftKey) || rule.when !== rules[0].when)) return null;
  const when = rules[0]?.when;
  return {
    weekendEnabled: when === 'weekend' || when === 'weekendOrHoliday',
    holidayEnabled: when === 'koreanHoliday' || when === 'weekendOrHoliday',
    targetShiftKeys: [...new Set(rules.map((rule) => rule.baseShiftKey))],
    restShiftKey: rest.key,
  };
}

export function configurePresetRestRules(preset: ShiftPreset, settings: PresetRestRuleSettings): ShiftPreset {
  const workKeys = new Set(preset.shiftTypes.filter((type) => type.kind === 'work' && preset.pattern.includes(type.key)).map((type) => type.key));
  if (!preset.shiftTypes.some((type) => type.key === settings.restShiftKey && type.kind === 'rest')
    || settings.targetShiftKeys.some((key) => !workKeys.has(key))) throw new Error('Invalid preset rest rule settings');
  const when = settings.weekendEnabled && settings.holidayEnabled ? 'weekendOrHoliday'
    : settings.weekendEnabled ? 'weekend' : settings.holidayEnabled ? 'koreanHoliday' : undefined;
  if (when && settings.targetShiftKeys.length === 0) throw new Error('Select a work shift for the rest rule');
  const configured: ShiftPreset = {
    ...preset,
    conditionalRules: when ? settings.targetShiftKeys.map((baseShiftKey) => ({ when, baseShiftKey, resolvedShiftKey: settings.restShiftKey })) : undefined,
  };
  assertValidShiftPreset(configured);
  return configured;
}
