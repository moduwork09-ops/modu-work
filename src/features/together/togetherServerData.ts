import * as Crypto from 'expo-crypto';

import { supabase } from '../../lib/supabase';
import {
  addLocalCalendarDays,
  assertValidDayOffProjectionRange,
  countLocalCalendarDays,
  isLocalCalendarDate,
  type DayOffProjectionRange,
  type DayOffProjectionItem,
} from './dayOffProjection';
import {
  parseTogetherCommonAvailability,
  type TogetherCommonAvailability,
} from './commonAvailabilityPresentation';
import { isTogetherSpaceType, type TogetherSpace, type TogetherSpaceType } from './types';
import { normalizeTogetherSpaceUpdate } from './togetherSpaceUpdate';

export type { TogetherCommonAvailability, TogetherCommonAvailabilityStatus } from './commonAvailabilityPresentation';

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

export type TogetherCommonDayOffAvailability = 'common' | 'not_common' | 'unavailable';

export type TogetherCommonDayOff = {
  localDate: string;
  myIsDayOff: boolean | null;
  activeMemberCount: number;
  eligibleMemberCount: number;
  syncedMemberCount: number;
  dayOffMemberCount: number;
  isCommonDayOff: boolean;
  availabilityStatus: TogetherCommonDayOffAvailability;
};

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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseTogetherCommonDayOff(value: unknown): TogetherCommonDayOff {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
  if (
    !row
    || !isLocalCalendarDate(row.local_date)
    || (row.my_is_day_off !== null && typeof row.my_is_day_off !== 'boolean')
    || !isNonNegativeInteger(row.active_member_count)
    || !isNonNegativeInteger(row.eligible_member_count)
    || !isNonNegativeInteger(row.synced_member_count)
    || !isNonNegativeInteger(row.day_off_member_count)
    || typeof row.is_common_day_off !== 'boolean'
    || (row.availability_status !== 'common'
      && row.availability_status !== 'not_common'
      && row.availability_status !== 'unavailable')
  ) {
    throw new Error('Invalid together common day off');
  }

  if (row.eligible_member_count > row.active_member_count
    || row.synced_member_count > row.eligible_member_count
    || row.day_off_member_count > row.synced_member_count) {
    throw new Error('Invalid together common day off counts');
  }

  const isComplete = row.active_member_count > 0
    && row.eligible_member_count === row.active_member_count
    && row.synced_member_count === row.active_member_count;
  const expectedStatus: TogetherCommonDayOffAvailability = isComplete
    ? row.day_off_member_count === row.active_member_count ? 'common' : 'not_common'
    : 'unavailable';
  if (row.availability_status !== expectedStatus
    || row.is_common_day_off !== (expectedStatus === 'common')) {
    throw new Error('Invalid together common day off status');
  }

  return {
    localDate: row.local_date,
    myIsDayOff: row.my_is_day_off,
    activeMemberCount: row.active_member_count,
    eligibleMemberCount: row.eligible_member_count,
    syncedMemberCount: row.synced_member_count,
    dayOffMemberCount: row.day_off_member_count,
    isCommonDayOff: row.is_common_day_off,
    availabilityStatus: row.availability_status,
  };
}

export async function getAuthenticatedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!isTogetherSpaceId(userId)) throw new Error('Authentication required');
  return userId;
}

export type MyDayOffSyncCoverage = {
  rangeStart: string;
  rangeEnd: string;
};

export async function getMyDayOffSyncCoverage(): Promise<MyDayOffSyncCoverage | null> {
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from('user_day_off_sync_state')
    .select('range_start, range_end')
    .eq('user_id', userId);

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid day off sync coverage response');
  if (data.length === 0) return null;
  if (data.length !== 1) throw new Error('Invalid day off sync coverage response');
  const row = data[0] as Record<string, unknown>;
  if (!isLocalCalendarDate(row.range_start)
    || !isLocalCalendarDate(row.range_end)
    || row.range_start > row.range_end) {
    throw new Error('Invalid day off sync coverage response');
  }
  return { rangeStart: row.range_start, rangeEnd: row.range_end };
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

export async function syncMyDayOffProjectionRange(range: DayOffProjectionRange): Promise<void> {
  assertValidDayOffProjectionRange(range);
  const syncBatchId = Crypto.randomUUID();
  if (!isTogetherSpaceId(syncBatchId)) throw new Error('Invalid sync batch id');

  const { error } = await supabase.rpc('sync_my_day_off_projection_range', {
    p_range_start: range.rangeStart,
    p_range_end: range.rangeEnd,
    p_sync_batch_id: syncBatchId,
    p_days: range.days.map((day) => ({
      local_date: day.localDate,
      is_day_off: day.isDayOff,
    })),
  });

  if (error) throw error;
}

export async function upsertMyDayOffProjections(days: DayOffProjectionItem[]): Promise<void> {
  if (!Array.isArray(days) || days.length < 1 || days.length > 100) {
    throw new Error('Invalid day off projection items');
  }
  const seenDates = new Set<string>();
  days.forEach((day) => {
    if (!day || !isLocalCalendarDate(day.localDate) || typeof day.isDayOff !== 'boolean' || seenDates.has(day.localDate)) {
      throw new Error('Invalid day off projection item');
    }
    seenDates.add(day.localDate);
  });
  const syncBatchId = Crypto.randomUUID();
  if (!isTogetherSpaceId(syncBatchId)) throw new Error('Invalid sync batch id');

  const { error } = await supabase.rpc('upsert_my_day_off_projections', {
    p_sync_batch_id: syncBatchId,
    p_days: days.map((day) => ({
      local_date: day.localDate,
      is_day_off: day.isDayOff,
    })),
  });
  if (error) throw error;
}

export async function clearMyDayOffProjections(): Promise<void> {
  const { error } = await supabase.rpc('clear_my_day_off_projections');
  if (error) throw error;
}

export async function getTogetherCommonDaysOff(
  spaceId: string,
  from: string,
  to: string,
): Promise<TogetherCommonDayOff[]> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');
  if (!isLocalCalendarDate(from) || !isLocalCalendarDate(to)) throw new Error('Invalid common days off range');
  const expectedCount = countLocalCalendarDays(from, to);
  if (expectedCount < 1 || expectedCount > 62) throw new Error('Invalid common days off range');

  const { data, error } = await supabase.rpc('get_together_common_days_off', {
    p_space_id: spaceId,
    p_from: from,
    p_to: to,
  });

  if (error) throw error;
  if (!Array.isArray(data) || data.length !== expectedCount) {
    throw new Error('Invalid together common days off response');
  }

  const days = data.map(parseTogetherCommonDayOff);
  const seenDates = new Set<string>();
  days.forEach((day, index) => {
    const expectedDate = addLocalCalendarDays(from, index);
    if (day.localDate !== expectedDate || seenDates.has(day.localDate)) {
      throw new Error('Invalid together common days off sequence');
    }
    seenDates.add(day.localDate);
  });
  if (days[0].localDate !== from || days[days.length - 1].localDate !== to) {
    throw new Error('Invalid together common days off bounds');
  }
  return days;
}

export async function getTogetherCommonAvailability(
  spaceId: string,
  from: string,
  to: string,
): Promise<TogetherCommonAvailability[]> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');
  if (!isLocalCalendarDate(from) || !isLocalCalendarDate(to)) throw new Error('Invalid common availability range');
  const expectedCount = countLocalCalendarDays(from, to);
  if (expectedCount < 1 || expectedCount > 62) throw new Error('Invalid common availability range');

  const { data, error } = await supabase.rpc('get_together_common_availability', {
    p_space_id: spaceId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== expectedCount) {
    throw new Error('Invalid together common availability response');
  }

  const days = data.map(parseTogetherCommonAvailability);
  days.forEach((day, index) => {
    if (day.localDate !== addLocalCalendarDays(from, index)) {
      throw new Error('Invalid together common availability sequence');
    }
  });
  return days;
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

export async function updateTogetherSpace(spaceId: string, name: string, type: TogetherSpaceType): Promise<void> {
  if (!isTogetherSpaceId(spaceId)) throw new Error('Invalid together space id');
  const update = normalizeTogetherSpaceUpdate(name, type);
  if (!update) throw new Error('Invalid together space update');

  const { error } = await supabase.rpc('update_together_space', {
    p_space_id: spaceId,
    p_name: update.name,
    p_type: update.type,
  });
  if (error) throw error;
}
