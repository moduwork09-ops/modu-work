import type { ShiftType } from '../shift-settings/mockData';
import { getKoreanHolidayResolution } from '../calendar/koreanHolidays';
import type { ConditionalShiftRule } from './conditionalShiftRule';
import { getShiftPatternHistoryEntryForDate } from './shiftSchedule';
import type { ShiftPatternHistoryEntry } from './shiftSettingsStorage';

export type CurrentRestRuleSettings = {
  weekendEnabled: boolean;
  holidayEnabled: boolean;
  targetShiftTypeIds: string[];
  restShiftTypeId: string;
};

export function readCurrentRestRules(rules: readonly ConditionalShiftRule[] | undefined, shiftTypes: readonly ShiftType[], pattern: readonly string[]): CurrentRestRuleSettings | null {
  const workIds = new Set(shiftTypes.filter((type) => type.kind === 'work' && pattern.includes(type.id)).map((type) => type.id));
  const rest = rules?.length
    ? shiftTypes.find((type) => type.id === rules[0].resolvedShiftTypeId && type.kind === 'rest')
    : shiftTypes.find((type) => type.kind === 'rest' && (type.id === 'shift-rest' || type.abbreviation === '휴'))
      ?? shiftTypes.find((type) => type.kind === 'rest');
  if (!rest || (rules?.some((rule) => rule.resolvedShiftTypeId !== rest.id || !workIds.has(rule.baseShiftTypeId) || rule.when !== rules[0].when) ?? false)) return null;
  const when = rules?.[0]?.when;
  return {
    weekendEnabled: when === 'weekend' || when === 'weekendOrHoliday',
    holidayEnabled: when === 'koreanHoliday' || when === 'weekendOrHoliday',
    targetShiftTypeIds: [...new Set(rules?.map((rule) => rule.baseShiftTypeId) ?? [])],
    restShiftTypeId: rest.id,
  };
}

export function buildCurrentRestRuleHistory(input: {
  effectiveFrom: string;
  patternHistory: ShiftPatternHistoryEntry[];
  shiftTypes: ShiftType[];
  fallback: Pick<ShiftPatternHistoryEntry, 'pattern' | 'anchorDate' | 'anchorPatternIndex' | 'teamRotation'>;
  settings: CurrentRestRuleSettings;
  createdAt: string;
}): ShiftPatternHistoryEntry[] {
  const { effectiveFrom, patternHistory, shiftTypes, fallback, settings, createdAt } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || new Date(`${effectiveFrom}T12:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom) throw new Error('Invalid effective date');
  const source = getShiftPatternHistoryEntryForDate(effectiveFrom, patternHistory);
  if (patternHistory.length && !source) throw new Error('Choose a date within the current schedule');
  const pattern = source?.pattern ?? fallback.pattern;
  const workIds = new Set(shiftTypes.filter((type) => type.kind === 'work' && pattern.includes(type.id)).map((type) => type.id));
  if (!shiftTypes.some((type) => type.id === settings.restShiftTypeId && type.kind === 'rest')) throw new Error('Choose a rest shift type');
  if (settings.targetShiftTypeIds.some((id) => !workIds.has(id))) throw new Error('Invalid work shift type');
  const when = settings.weekendEnabled && settings.holidayEnabled ? 'weekendOrHoliday'
    : settings.weekendEnabled ? 'weekend' : settings.holidayEnabled ? 'koreanHoliday' : undefined;
  if (when && !settings.targetShiftTypeIds.length) throw new Error('Choose a work shift type');
  if (settings.holidayEnabled && getKoreanHolidayResolution(effectiveFrom).status === 'unsupported') throw new Error('Holiday data is unavailable for this year');
  const conditionalRules: ConditionalShiftRule[] | undefined = when
    ? settings.targetShiftTypeIds.map((baseShiftTypeId) => ({ when, baseShiftTypeId, resolvedShiftTypeId: settings.restShiftTypeId }))
    : undefined;
  const existing = patternHistory.find((entry) => entry.effectiveFrom === effectiveFrom);
  const nextEntry: ShiftPatternHistoryEntry = existing
    ? { ...existing, conditionalRules }
    : { ...(source ?? fallback), id: `shift-pattern-${effectiveFrom}`, effectiveFrom, createdAt, conditionalRules };
  return [...patternHistory.filter((entry) => entry.effectiveFrom !== effectiveFrom), nextEntry]
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
}
