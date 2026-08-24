import { supabase } from '../../lib/supabase';
import type { TogetherSpace, TogetherSpaceType } from './types';

const TOGETHER_SPACE_TYPES: TogetherSpaceType[] = ['family', 'couple', 'coworker', 'friend', 'custom'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TogetherMember = {
  userId: string;
  displayName: string | null;
  role: string;
  status: string;
  joinedAt: string;
};

export type TogetherInvitation = {
  invitationId: string;
  inviteToken: string;
  inviteCode: string;
  expiresAt: string;
};

export type TogetherSharePolicy = {
  spaceId: string;
  ownerUserId: string;
  shareAvailability: boolean;
  shareDaysOff: boolean;
  sharePersonalEvents: boolean;
  shareSharedEvents: boolean;
  shareShiftDetails: boolean;
  updatedAt: string | null;
};

export type TogetherSharePolicySettings = Pick<
  TogetherSharePolicy,
  'shareAvailability' | 'shareDaysOff' | 'sharePersonalEvents' | 'shareSharedEvents' | 'shareShiftDetails'
>;

function isTogetherSpaceType(value: unknown): value is TogetherSpaceType {
  return typeof value === 'string' && TOGETHER_SPACE_TYPES.includes(value as TogetherSpaceType);
}

function isTimestampString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isTogetherSpaceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function toTogetherSpace(value: unknown): TogetherSpace {
  if (!value || typeof value !== 'object') throw new Error('Invalid together space');
  const row = value as Record<string, unknown>;

  if (
    !isTogetherSpaceId(row.id)
    || typeof row.name !== 'string'
    || !isTogetherSpaceType(row.type)
    || !isTogetherSpaceId(row.created_by)
    || typeof row.created_at !== 'string'
  ) {
    throw new Error('Invalid together space');
  }

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toTogetherMember(value: unknown): TogetherMember {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;

  if (
    !row
    || !isTogetherSpaceId(row.user_id)
    || (row.display_name !== null && typeof row.display_name !== 'string')
    || typeof row.role !== 'string'
    || typeof row.status !== 'string'
    || typeof row.joined_at !== 'string'
  ) {
    throw new Error('Invalid together member');
  }

  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

function toTogetherInvitation(value: unknown): TogetherInvitation {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;

  if (
    !row
    || !isTogetherSpaceId(row.invitation_id)
    || !isTogetherSpaceId(row.invite_token)
    || typeof row.invite_code !== 'string'
    || !row.invite_code.trim()
    || typeof row.expires_at !== 'string'
  ) {
    throw new Error('Invalid together invitation');
  }

  return {
    invitationId: row.invitation_id,
    inviteToken: row.invite_token,
    inviteCode: row.invite_code,
    expiresAt: row.expires_at,
  };
}

function createEmptyTogetherSharePolicy(spaceId: string, ownerUserId: string): TogetherSharePolicy {
  return {
    spaceId,
    ownerUserId,
    shareAvailability: false,
    shareDaysOff: false,
    sharePersonalEvents: false,
    shareSharedEvents: false,
    shareShiftDetails: false,
    updatedAt: null,
  };
}

function toTogetherSharePolicy(value: unknown): TogetherSharePolicy {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;

  if (
    !row
    || !isTogetherSpaceId(row.space_id)
    || !isTogetherSpaceId(row.owner_user_id)
    || typeof row.share_availability !== 'boolean'
    || typeof row.share_days_off !== 'boolean'
    || typeof row.share_personal_events !== 'boolean'
    || typeof row.share_shared_events !== 'boolean'
    || typeof row.share_shift_details !== 'boolean'
    || !isTimestampString(row.updated_at)
  ) {
    throw new Error('Invalid together share policy');
  }

  return {
    spaceId: row.space_id,
    ownerUserId: row.owner_user_id,
    shareAvailability: row.share_availability,
    shareDaysOff: row.share_days_off,
    sharePersonalEvents: row.share_personal_events,
    shareSharedEvents: row.share_shared_events,
    shareShiftDetails: row.share_shift_details,
    updatedAt: row.updated_at,
  };
}

async function getAuthenticatedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!isTogetherSpaceId(userId)) throw new Error('Authentication required');
  return userId;
}

export async function getTogetherSpaces(): Promise<TogetherSpace[]> {
  const { data, error } = await supabase
    .from('together_spaces')
    .select('id, name, type, created_by, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid together spaces response');
  return data.map(toTogetherSpace);
}

export async function getTogetherSpace(spaceId: string): Promise<TogetherSpace> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');

  const { data, error } = await supabase
    .from('together_spaces')
    .select('id, name, type, created_by, created_at')
    .eq('id', spaceId)
    .single();

  if (error) throw error;
  return toTogetherSpace(data);
}

export async function getTogetherMembers(spaceId: string): Promise<TogetherMember[]> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');

  const { data, error } = await supabase.rpc('get_together_members', {
    p_space_id: spaceId,
  });

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid together members response');
  return data.map(toTogetherMember);
}

export async function createTogetherInvitation(spaceId: string): Promise<TogetherInvitation> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');

  const { data, error } = await supabase.rpc('create_together_invitation', {
    p_space_id: spaceId,
  });

  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) throw new Error('Invalid together invitation response');
  return toTogetherInvitation(data[0]);
}

export async function acceptTogetherInvitation(inviteCode: string): Promise<string> {
  const normalizedCode = inviteCode.trim();
  if (!normalizedCode) throw new Error('Invalid together invite code');

  const { data, error } = await supabase.rpc('accept_together_invitation', {
    p_invite_code: normalizedCode,
  });

  if (error) throw error;
  if (!isTogetherSpaceId(data)) throw new Error('Invalid together space id');
  return data;
}

export async function getMyTogetherSharePolicy(spaceId: string): Promise<TogetherSharePolicy> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from('share_policies')
    .select('space_id, owner_user_id, share_availability, share_days_off, share_personal_events, share_shared_events, share_shift_details, updated_at')
    .eq('space_id', spaceId)
    .eq('owner_user_id', userId);

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid together share policy response');
  if (data.length === 0) return createEmptyTogetherSharePolicy(spaceId, userId);
  if (data.length !== 1) throw new Error('Invalid together share policy response');

  const policy = toTogetherSharePolicy(data[0]);
  if (policy.spaceId !== spaceId || policy.ownerUserId !== userId) {
    throw new Error('Invalid together share policy response');
  }
  return policy;
}

export async function updateMyTogetherSharePolicy(
  spaceId: string,
  settings: TogetherSharePolicySettings,
): Promise<void> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');

  const { error } = await supabase.rpc('update_my_share_policy', {
    p_space_id: spaceId,
    p_share_availability: settings.shareAvailability,
    p_share_days_off: settings.shareDaysOff,
    p_share_personal_events: settings.sharePersonalEvents,
    p_share_shared_events: settings.shareSharedEvents,
    p_share_shift_details: settings.shareShiftDetails,
  });

  if (error) throw error;
}

export async function createTogetherSpace(name: string, type: TogetherSpaceType): Promise<string> {
  const { data, error } = await supabase.rpc('create_together_space', {
    p_name: name.trim(),
    p_type: type,
  });

  if (error) throw error;
  if (!isTogetherSpaceId(data)) throw new Error('Invalid together space id');
  return data;
}
