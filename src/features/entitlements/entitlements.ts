import { supabase } from '../../lib/supabase';
import type { RedeemResult, UserEntitlement } from './entitlementModel';

function parseEntitlement(row: Record<string, unknown>, userId: string): UserEntitlement {
  if (typeof row.id !== 'string' || row.user_id !== userId || row.entitlement !== 'premium'
    || !['beta', 'event', 'admin', 'play_subscription'].includes(String(row.source))
    || typeof row.starts_at !== 'string' || (row.expires_at !== null && typeof row.expires_at !== 'string')
    || typeof row.is_active !== 'boolean') throw new Error('Invalid entitlement response');
  return {
    id: row.id, userId, entitlement: 'premium', source: row.source as UserEntitlement['source'],
    startsAt: row.starts_at, expiresAt: row.expires_at, isActive: row.is_active,
    note: typeof row.note === 'string' ? row.note : null,
  };
}

export async function listUserEntitlements(userId: string): Promise<UserEntitlement[]> {
  const { data, error } = await supabase.from('user_entitlements')
    .select('id,user_id,entitlement,source,starts_at,expires_at,is_active,note')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid entitlement response');
  return data.map((row) => parseEntitlement(row, userId));
}

export async function redeemEntitlementCode(code: string, expectedUserId: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_entitlement_code', { p_code: code, p_expected_user_id: expectedUserId });
  if (error) throw error;
  if (!['redeemed', 'invalid', 'expired', 'already_redeemed', 'exhausted'].includes(String(data))) throw new Error('Invalid redemption response');
  return data as RedeemResult;
}
