import { supabase } from '../../lib/supabase';
import { normalizeProfileDisplayName } from './profileDisplayName';

export type Profile = {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Invalid profile response');
  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || (row.display_name !== null && typeof row.display_name !== 'string')
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string'
  ) {
    throw new Error('Invalid profile response');
  }
  return {
    id: row.id,
    display_name: row.display_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateMyProfileDisplayName(displayName: string): Promise<void> {
  const normalizedName = normalizeProfileDisplayName(displayName);
  if (!normalizedName) throw new Error('Invalid profile display name');

  const { error } = await supabase.rpc('update_my_profile_display_name', {
    p_display_name: normalizedName,
  });
  if (error) throw error;
}
