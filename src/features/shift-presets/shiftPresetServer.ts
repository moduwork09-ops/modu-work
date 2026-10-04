import { supabase } from '../../lib/supabase';
import type { ShiftPreset } from './shiftPreset';
import { parseShiftPresetPayloadRow, serializeShiftPresetPayload } from './shiftPresetPayload';
import { normalizeShiftPresetShareCode } from './shiftPresetShareCode';
import { normalizePresetRequestQuery } from './presetGrowth';
import { createCandidateSafePreset } from './presetGrowth';

export { normalizeShiftPresetShareCode } from './shiftPresetShareCode';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ShiftPresetVisibility = 'public' | 'unlisted';
export type ShiftPresetShareMode = 'single' | 'reusable';
export type ResolvedShiftPresetShare = { preset: ShiftPreset; code: string; mode: ShiftPresetShareMode; claimedByCurrentUser: boolean };
export type SearchShiftPresetResult = { preset: ShiftPreset; jobRole?: string; workplaceName?: string; department?: string; verificationCount: number; lastVerifiedAt?: string };

export class ShiftPresetShareError extends Error {
  constructor(public readonly reason: 'not_found' | 'already_claimed' | 'invalid_response') { super(reason); this.name = 'ShiftPresetShareError'; }
}

function parsePresetRow(value: unknown, source: ShiftPreset['source']): ShiftPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShiftPresetShareError('invalid_response');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !UUID.test(row.id)) throw new ShiftPresetShareError('invalid_response');
  try { return parseShiftPresetPayloadRow(row, source); } catch { throw new ShiftPresetShareError('invalid_response'); }
}

function firstRow(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1) throw new ShiftPresetShareError('invalid_response');
  return data[0];
}

function mapShareError(error: { code?: string } | null) {
  if (error?.code === 'PT409') throw new ShiftPresetShareError('already_claimed');
  if (error?.code === 'PT404') throw new ShiftPresetShareError('not_found');
  if (error) throw error;
}

export async function createServerShiftPreset(preset: ShiftPreset, visibility: 'unlisted') {
  const payload = serializeShiftPresetPayload(preset);
  const { data, error } = await supabase.rpc('create_shift_preset', { p_name: preset.name, p_organization_name: preset.organizationName ?? null, p_visibility: visibility, p_payload: payload });
  if (error) throw error;
  if (typeof data !== 'string' || !UUID.test(data)) throw new Error('Invalid shift preset id');
  return data;
}

export async function searchShiftPresets(query: string): Promise<SearchShiftPresetResult[]> {
  const { displayQuery } = normalizePresetRequestQuery(query);
  const { data, error } = await supabase.rpc('search_shift_presets', { p_query: displayQuery });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid shift preset search response');
  return data.map((row) => ({
    preset: parsePresetRow(row, 'public'),
    jobRole: typeof row.job_role === 'string' ? row.job_role : undefined,
    workplaceName: typeof row.workplace_name === 'string' ? row.workplace_name : undefined,
    department: typeof row.department === 'string' ? row.department : undefined,
    verificationCount: typeof row.verification_count === 'number' ? row.verification_count : Number(row.verification_count ?? 0),
    lastVerifiedAt: typeof row.last_verified_at === 'string' ? row.last_verified_at : undefined,
  }));
}

export async function recordPresetRequest(query: string) {
  const { displayQuery } = normalizePresetRequestQuery(query);
  const { error } = await supabase.rpc('record_preset_request', { p_query: displayQuery });
  if (error) throw error;
}

export async function submitShiftPresetCandidate(presetId: string, preset: ShiftPreset, metadata: { jobRole?: string; workplaceName?: string; department?: string }) {
  if (!UUID.test(presetId)) throw new Error('Invalid shift preset id');
  const { data, error } = await supabase.rpc('submit_shift_preset_candidate', {
    p_preset_id: presetId, p_payload: serializeShiftPresetPayload(createCandidateSafePreset(preset)), p_job_role: metadata.jobRole?.trim() || null,
    p_workplace_name: metadata.workplaceName?.trim() || null, p_department: metadata.department?.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !UUID.test(data)) throw new Error('Invalid candidate response');
  return data;
}

export async function confirmShiftPresetApplication(code: string) {
  const normalized = normalizeShiftPresetShareCode(code);
  if (!normalized) throw new Error('Invalid share code');
  const { data, error } = await supabase.rpc('confirm_shift_preset_application', { p_code: normalized });
  if (error) throw error;
  return data === true;
}

export async function getPublicShiftPreset(id: string) {
  if (!UUID.test(id)) throw new Error('Invalid shift preset id');
  const { data, error } = await supabase.rpc('get_shift_preset', { p_preset_id: id });
  if (error) throw error;
  return parsePresetRow(firstRow(data), 'public');
}

export async function createShiftPresetShare(presetId: string, mode: ShiftPresetShareMode) {
  if (!UUID.test(presetId) || (mode !== 'single' && mode !== 'reusable')) throw new Error('Invalid shift preset share');
  const { data, error } = await supabase.rpc('create_shift_preset_share', { p_preset_id: presetId, p_mode: mode });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid shift preset share code');
  const code = normalizeShiftPresetShareCode(data);
  if (code !== data) throw new Error('Invalid shift preset share code');
  return code;
}

function parseResolvedShare(value: unknown): ResolvedShiftPresetShare {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShiftPresetShareError('invalid_response');
  const row = value as Record<string, unknown>;
  const code = typeof row.code === 'string' ? normalizeShiftPresetShareCode(row.code) : '';
  if (!code || (row.mode !== 'single' && row.mode !== 'reusable') || typeof row.claimed_by_current_user !== 'boolean') throw new ShiftPresetShareError('invalid_response');
  return { preset: parsePresetRow(row, 'shared'), code, mode: row.mode, claimedByCurrentUser: row.claimed_by_current_user };
}

export async function resolveShiftPresetShare(rawCode: string) {
  const code = normalizeShiftPresetShareCode(rawCode);
  if (!code) throw new ShiftPresetShareError('not_found');
  const { data, error } = await supabase.rpc('resolve_shift_preset_share', { p_code: code });
  mapShareError(error);
  return parseResolvedShare(firstRow(data));
}

export async function claimShiftPresetShare(rawCode: string) {
  const code = normalizeShiftPresetShareCode(rawCode);
  if (!code) throw new ShiftPresetShareError('not_found');
  const { data, error } = await supabase.rpc('claim_shift_preset_share', { p_code: code });
  mapShareError(error);
  return parseResolvedShare(firstRow(data));
}
