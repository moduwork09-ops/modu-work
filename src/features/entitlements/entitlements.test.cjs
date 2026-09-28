const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { isEntitlementActive, entitlementTitle, entitlementPeriod, redeemResultMessage } = require('./entitlementModel.ts');
const migration = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260928140000_add_account_entitlements.sql'), 'utf8');
const base = { id: 'one', userId: 'A', entitlement: 'premium', source: 'beta', startsAt: '2026-09-01T00:00:00Z', expiresAt: null, isActive: true, note: null };
const now = new Date('2026-09-28T00:00:00Z');

test('lifetime, future, expired, and period entitlement states', () => {
  assert.equal(isEntitlementActive(base, now), true);
  assert.equal(isEntitlementActive({ ...base, startsAt: '2026-10-01T00:00:00Z' }, now), false);
  assert.equal(isEntitlementActive({ ...base, expiresAt: '2026-09-27T00:00:00Z' }, now), false);
  assert.equal(isEntitlementActive({ ...base, expiresAt: '2026-10-01T00:00:00Z' }, now), true);
  assert.equal(isEntitlementActive({ ...base, isActive: false }, now), false);
  assert.equal(isEntitlementActive({ ...base, startsAt: 'invalid' }, now), false);
});

test('display labels and redemption results', () => {
  assert.equal(entitlementTitle(base), '베타 감사 평생 이용권');
  assert.equal(entitlementPeriod(base), 'Premium · 평생');
  assert.equal(entitlementTitle({ ...base, source: 'event' }), '이벤트 평생 이용권');
  assert.match(entitlementPeriod({ ...base, expiresAt: '2027-09-28T00:00:00Z' }), /2027\.09\.28까지/);
  for (const result of ['redeemed', 'invalid', 'expired', 'already_redeemed', 'exhausted']) assert.ok(redeemResultMessage(result));
});

test('migration keeps entitlement writes server-only and redeem serial', () => {
  assert.match(migration, /create policy user_entitlements_read_own.*auth\.uid\(\)=user_id/);
  assert.match(migration, /grant select on table public\.user_entitlements to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.user_entitlements to authenticated/);
  assert.match(migration, /for update;/);
  assert.match(migration, /unique\(code_id,user_id\)/);
  assert.match(migration, /v_user is distinct from p_expected_user_id/);
  assert.match(migration, /security definer set search_path to ''/);
  assert.match(migration, /pg_catalog\.sha256/);
});
