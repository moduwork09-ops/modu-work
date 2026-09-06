import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import type { ShiftType } from '../shift-settings/mockData';
import type { SalarySettings } from './salaryTypes';

/** Only user-confirmed ID links establish identity. Names, colors and times never do. */
export function resolveSalaryShiftId(id: string, links: Record<string, string> = {}): string {
  const visited = new Set<string>();
  let current = id;
  while (Object.prototype.hasOwnProperty.call(links, current)) {
    if (visited.has(current)) return id;
    visited.add(current);
    current = links[current];
  }
  return current;
}

export function isValidSalaryShiftLinks(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const links = value as Record<string, unknown>;
  for (const [id, target] of Object.entries(links)) {
    if (!id || typeof target !== 'string' || !target || id === target) return false;
    const visited = new Set<string>([id]);
    let current = target;
    while (Object.prototype.hasOwnProperty.call(links, current)) {
      if (visited.has(current)) return false;
      visited.add(current);
      if (typeof links[current] !== 'string') return false;
      current = links[current] as string;
    }
  }
  return true;
}

export function getSalaryShiftIdentity(id: string, schedule: ShiftScheduleInput, settings: SalarySettings) {
  const linkedId = resolveSalaryShiftId(id, settings.shiftTypeLinks);
  const identity = schedule.shiftTypes.find(type => type.id === linkedId)
    ?? schedule.shiftTypes.find(type => type.id === id)!;
  // Preserve any explicit historical rate, including zero.
  const amount = settings.shiftAllowanceByShiftTypeId[id]?.amount
    ?? settings.shiftAllowanceByShiftTypeId[identity.id]?.amount ?? 0;
  return { identity, amount };
}

export function getHistoricalSalaryTypes(schedule: ShiftScheduleInput, editableIds: string[]) {
  const active = new Set(editableIds);
  const referenced = new Set([
    ...schedule.shiftPattern,
    ...(schedule.patternHistory ?? []).flatMap(entry => entry.pattern),
    ...Object.values(schedule.shiftDateOverrides ?? {}).map(entry => entry.shiftTypeId),
  ]);
  return schedule.shiftTypes.filter(type => referenced.has(type.id) && !active.has(type.id));
}

export type HistoricalSalaryTypeGroup = {
  id: string;
  effectiveFrom: string | null;
  shiftTypes: ShiftType[];
  isComplete: boolean;
};

/** Group historical IDs by their latest pattern reference without changing stored history. */
export function getHistoricalSalaryTypeGroups(
  schedule: ShiftScheduleInput,
  historicalTypes: ShiftType[],
  editableTypes: ShiftType[],
  links: Record<string, string> = {},
): HistoricalSalaryTypeGroup[] {
  const historicalById = new Map(historicalTypes.map(type => [type.id, type]));
  const assignedIds = new Set<string>();
  const typesByEffectiveFrom = new Map<string, ShiftType[]>();
  const entries = [...(schedule.patternHistory ?? [])]
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));

  for (const entry of entries) {
    const group = typesByEffectiveFrom.get(entry.effectiveFrom) ?? [];
    for (const id of entry.pattern) {
      const type = historicalById.get(id);
      if (!type || assignedIds.has(id)) continue;
      assignedIds.add(id);
      group.push(type);
    }
    if (group.length > 0) typesByEffectiveFrom.set(entry.effectiveFrom, group);
  }

  const grouped: Omit<HistoricalSalaryTypeGroup, 'isComplete'>[] = Array.from(typesByEffectiveFrom, ([effectiveFrom, shiftTypes]) => ({
    id: `history:${effectiveFrom}`,
    effectiveFrom,
    shiftTypes,
  }));
  const remaining = historicalTypes.filter(type => !assignedIds.has(type.id));
  if (remaining.length > 0) grouped.push({ id: 'history:other', effectiveFrom: null, shiftTypes: remaining });

  const editableIds = new Set(editableTypes.map(type => type.id));
  return grouped.map(group => ({
    ...group,
    isComplete: group.shiftTypes.every(type => Object.prototype.hasOwnProperty.call(links, type.id)
      && editableIds.has(resolveSalaryShiftId(type.id, links))),
  }));
}

const CUSTOM_SHIFT_ID = /^custom-shift-\d+$/;

function recommendationSignature(type: ShiftType) {
  return JSON.stringify([
    type.name.trim(),
    type.abbreviation.trim(),
    type.kind,
    type.startTime ?? null,
    type.endTime ?? null,
    type.color.toUpperCase(),
    type.textColor.toUpperCase(),
  ]);
}

/**
 * Return conservative ID-link suggestions only. The caller must require an explicit
 * user action before adding these links to the unsaved draft.
 */
export function getRecommendedSalaryShiftLinks(
  historicalTypes: ShiftType[],
  editableTypes: ShiftType[],
  existingLinks: Record<string, string> = {},
): Record<string, string> {
  const candidatesBySignature = new Map<string, ShiftType[]>();
  for (const type of editableTypes) {
    if (CUSTOM_SHIFT_ID.test(type.id)) continue;
    const signature = recommendationSignature(type);
    candidatesBySignature.set(signature, [...(candidatesBySignature.get(signature) ?? []), type]);
  }

  const recommendations: Record<string, string> = {};
  for (const type of historicalTypes) {
    if (CUSTOM_SHIFT_ID.test(type.id)
      || Object.prototype.hasOwnProperty.call(existingLinks, type.id)) continue;
    const candidates = candidatesBySignature.get(recommendationSignature(type)) ?? [];
    if (candidates.length === 1) recommendations[type.id] = candidates[0].id;
  }
  return recommendations;
}
