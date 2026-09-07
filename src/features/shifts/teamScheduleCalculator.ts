import type { ShiftType } from '../shift-settings/mockData';
import { getPatternIndexForDate, getShiftPatternHistoryEntryForDate, type ShiftScheduleInput } from './shiftSchedule';
import { isValidTeamRotationMetadata } from './teamRotation';

export type TeamShiftStatus = {
  teamId: string;
  teamLabel: string;
  isMyTeam: boolean;
  shiftType: ShiftType;
  patternIndex: number;
};

export type TeamStatusesResult =
  | { status: 'available'; statuses: TeamShiftStatus[] }
  | { status: 'unavailable' };

function modulo(value: number, length: number) {
  return ((value % length) + length) % length;
}

export function getTeamStatusesForDate(date: string, schedule: ShiftScheduleInput): TeamStatusesResult {
  const entry = getShiftPatternHistoryEntryForDate(date, schedule.patternHistory);
  const pattern = entry?.pattern ?? schedule.shiftPattern;
  const teamRotation = entry ? entry.teamRotation : schedule.teamRotation;
  if (!isValidTeamRotationMetadata(teamRotation, pattern.length)) return { status: 'unavailable' };

  const myTeam = teamRotation.teams.find((team) => team.id === teamRotation.myTeamId);
  if (!myTeam) return { status: 'unavailable' };
  const myPatternIndex = getPatternIndexForDate(date, schedule);
  const shiftTypesById = new Map(schedule.shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const statuses: TeamShiftStatus[] = [];

  for (const team of teamRotation.teams) {
    const patternIndex = modulo(myPatternIndex + team.patternIndexOffset - myTeam.patternIndexOffset, pattern.length);
    const shiftType = shiftTypesById.get(pattern[patternIndex]);
    if (!shiftType) return { status: 'unavailable' };
    statuses.push({ teamId: team.id, teamLabel: team.label, isMyTeam: team.id === teamRotation.myTeamId, shiftType, patternIndex });
  }

  return { status: 'available', statuses };
}
