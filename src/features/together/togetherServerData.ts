import { supabase } from '../../lib/supabase';
import type { TogetherSpace, TogetherSpaceType } from './types';

const TOGETHER_SPACE_TYPES: TogetherSpaceType[] = ['family', 'couple', 'coworker', 'friend', 'custom'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTogetherSpaceType(value: unknown): value is TogetherSpaceType {
  return typeof value === 'string' && TOGETHER_SPACE_TYPES.includes(value as TogetherSpaceType);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function toTogetherSpace(value: unknown): TogetherSpace {
  if (!value || typeof value !== 'object') throw new Error('Invalid together space');
  const row = value as Record<string, unknown>;

  if (
    !isUuid(row.id)
    || typeof row.name !== 'string'
    || !isTogetherSpaceType(row.type)
    || !isUuid(row.created_by)
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

export async function getTogetherSpaces(): Promise<TogetherSpace[]> {
  const { data, error } = await supabase
    .from('together_spaces')
    .select('id, name, type, created_by, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid together spaces response');
  return data.map(toTogetherSpace);
}

export async function createTogetherSpace(name: string, type: TogetherSpaceType): Promise<string> {
  const { data, error } = await supabase.rpc('create_together_space', {
    p_name: name.trim(),
    p_type: type,
  });

  if (error) throw error;
  if (!isUuid(data)) throw new Error('Invalid together space id');
  return data;
}
