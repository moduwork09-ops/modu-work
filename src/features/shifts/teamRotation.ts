import type { ShiftType } from '../shift-settings/mockData';

export type TeamRotationTeam = {
  id: string;
  label: string;
  patternIndexOffset: number;
};

export type TeamRotationMetadata = {
  version: 1;
  source: 'preset' | 'user_configured';
  myTeamId: string;
  teams: TeamRotationTeam[];
};

export type TeamRotationTemplate = {
  version: 1;
  teams: TeamRotationTeam[];
};

export const DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE: TeamRotationTemplate = {
  version: 1,
  teams: [
    { id: 'team-1', label: '1팀', patternIndexOffset: 0 },
    { id: 'team-2', label: '2팀', patternIndexOffset: 2 },
    { id: 'team-3', label: '3팀', patternIndexOffset: 1 },
    { id: 'team-4', label: '4팀', patternIndexOffset: 3 },
  ],
};

function hasValidTeams(teams: TeamRotationTeam[], patternLength?: number) {
  if (teams.length < 2 || (patternLength !== undefined && patternLength <= 0)) return false;
  const ids = new Set<string>();
  return teams.every((team) => {
    if (!team.id || !team.label.trim() || ids.has(team.id) || !Number.isFinite(team.patternIndexOffset) || !Number.isInteger(team.patternIndexOffset)) return false;
    ids.add(team.id);
    return true;
  });
}

export function isValidTeamRotationTemplate(value: unknown, patternLength?: number): value is TeamRotationTemplate {
  if (!value || typeof value !== 'object') return false;
  const template = value as TeamRotationTemplate;
  return template.version === 1 && Array.isArray(template.teams) && hasValidTeams(template.teams, patternLength);
}

export function isValidTeamRotationMetadata(value: unknown, patternLength?: number): value is TeamRotationMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as TeamRotationMetadata;
  return metadata.version === 1
    && (metadata.source === 'preset' || metadata.source === 'user_configured')
    && typeof metadata.myTeamId === 'string'
    && Array.isArray(metadata.teams)
    && hasValidTeams(metadata.teams, patternLength)
    && metadata.teams.some((team) => team.id === metadata.myTeamId);
}

export function createTeamRotationMetadata(template: TeamRotationTemplate, myTeamId: string, source: TeamRotationMetadata['source']) {
  if (!isValidTeamRotationTemplate(template) || !template.teams.some((team) => team.id === myTeamId)) return null;
  return { version: 1, source, myTeamId, teams: template.teams.map((team) => ({ ...team })) } satisfies TeamRotationMetadata;
}

export function isDayNightOffRestPatternCompatible(pattern: string[], shiftTypes: ShiftType[]) {
  if (pattern.length !== 4) return false;
  const [day, night, offDuty, rest] = pattern;

  if (new Set([day, night, offDuty, rest]).size !== 4) return false;
  const byId = new Map(shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const dayShift = byId.get(day);
  const nightShift = byId.get(night);
  const off = byId.get(offDuty);
  const restShift = byId.get(rest);
  return Boolean(dayShift?.kind === 'work' && dayShift.startTime && dayShift.endTime
    && nightShift?.kind === 'work' && nightShift.startTime && nightShift.endTime
    && off?.kind === 'rest' && restShift?.kind === 'rest');
}
