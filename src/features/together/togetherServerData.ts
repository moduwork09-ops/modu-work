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

function isTogetherSpaceType(value: unknown): value is TogetherSpaceType {
  return typeof value === 'string' && TOGETHER_SPACE_TYPES.includes(value as TogetherSpaceType);
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

export async function createTogetherSpace(name: string, type: TogetherSpaceType): Promise<string> {
  const { data, error } = await supabase.rpc('create_together_space', {
    p_name: name.trim(),
    p_type: type,
  });

  if (error) throw error;
  if (!isTogetherSpaceId(data)) throw new Error('Invalid together space id');
  return data;
}
