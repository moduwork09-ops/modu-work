const { readFileSync } = require('fs');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sql = readFileSync('supabase/migrations/20260902130000_add_shift_presets.sql', 'utf8');

assert(sql.includes('revoke all on table public.shift_presets from public, anon, authenticated;'), 'raw preset table privileges must be revoked');
assert(!/grant\s+select\s+on\s+table\s+public\.shift_presets\s+to\s+authenticated/i.test(sql), 'authenticated raw preset select must not be granted');

const selfClaimGuard = "if v_share.mode='single' and v_share.created_by=v_user then raise exception 'Share creator cannot claim own code'";
const recipientClaim = "if v_share.mode='single' and v_share.claimed_by is null then update public.shift_preset_shares set claimed_by=v_user,claimed_at=now()";
const recipientRetry = "elsif v_share.mode='single' and v_share.claimed_by<>v_user then raise exception 'Share already claimed'";
assert(sql.includes(selfClaimGuard), 'single share creator self-claim must be rejected');
assert(sql.indexOf(selfClaimGuard) < sql.indexOf(recipientClaim), 'creator rejection must run before first recipient claim');
assert(sql.includes(recipientClaim), 'first recipient must be claimed atomically');
assert(sql.includes(recipientRetry), 'same recipient retry must remain allowed while another recipient is rejected');
assert(sql.includes('for update;'), 'single claim must retain its row lock');

assert(sql.includes("nullif(btrim(p_organization_name), '') is not null"), 'blank organization names must bypass nonblank length validation');
assert(sql.includes("values (btrim(p_name), nullif(btrim(p_organization_name), ''), p_payload"), 'blank organization names must be stored as null');
assert(sql.includes("p.visibility = 'public' and p.revoked_at is null"), 'search must remain public-only');
assert(sql.includes("p.visibility = 'public' or p.created_by = auth.uid()"), 'detail visibility boundary must remain unchanged');

console.log('shiftPresetMigration fixtures passed');
