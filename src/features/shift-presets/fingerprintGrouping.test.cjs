const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261013160000_add_shift_preset_fingerprint_grouping.sql'), 'utf8');
const existingSearch = fs.readFileSync(path.join(root, 'supabase/migrations/20260928130000_add_preset_growth_foundations.sql'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/features/shift-presets/shiftPresetServer.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'app/shift-presets/search.tsx'), 'utf8');

function groupedSearchWith(supabase) {
  const source = ts.createSourceFile('shiftPresetServer.ts', adapter, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'searchShiftPresetGroups');
  assert(declaration);
  const code = ts.transpileModule(`${declaration.getText(source)}\nexports.search = searchShiftPresetGroups;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = {
    exports: {}, supabase,
    normalizePresetRequestQuery: (value) => ({ displayQuery: value.trim() }),
    parsePresetRow: (row) => ({ id: row.id, name: row.name }),
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports.search;
}

test('legacy direct-public presets are backfilled safely without changing visibility or share codes', () => {
  assert.match(migration, /where p\.visibility = 'public' and p\.revoked_at is null/);
  assert.match(migration, /not exists \(select 1 from public\.shift_preset_candidates c where c\.preset_id = p\.id\)/);
  assert.match(migration, /v_preset\.payload - 'description' - 'shiftTypes'/);
  assert.match(migration, /t\.value - 'note' order by t\.ordinality/);
  assert.match(migration, /public\.is_safe_preset_candidate_payload\(v_payload\) is distinct from true/);
  assert.match(migration, /v_fingerprint := public\.shift_preset_pattern_fingerprint\(v_payload\)/);
  assert.match(migration, /raise exception 'Cannot fingerprint public preset %'/);
  assert.match(migration, /values \(v_preset\.id, v_preset\.created_by, v_payload, 'approved', v_preset\.organization_name, v_fingerprint\)/);
  assert.match(migration, /on conflict \(preset_id\) do nothing/);
  assert.doesNotMatch(migration, /update public\.shift_presets|delete from public\.shift_presets|insert into public\.shift_preset_shares/i);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
});

test('only approved public fingerprinted presets participate in groups', () => {
  assert.match(migration, /join public\.shift_preset_candidates c on c\.preset_id = p\.id\s+and c\.status = 'approved' and c\.pattern_fingerprint is not null/);
  assert.match(migration, /p\.visibility = 'public' and p\.revoked_at is null/);
  assert.match(migration, /auth\.uid\(\) is not null/);
  assert.match(migration, /count\(\*\) over \(partition by e\.pattern_fingerprint\) as member_count/);
  assert.match(migration, /where r\.representative_rank = 1/);
});

test('member metadata matches the group while representative is deterministic', () => {
  assert.match(migration, /left join lateral \([\s\S]*from public\.preset_verifications pv where pv\.preset_id = p\.id/);
  assert.match(migration, /order by e\.verification_count desc, e\.created_at asc, e\.id asc/);
  assert.match(migration, /select distinct e\.pattern_fingerprint from eligible e/);
  for (const field of ['name', 'organization_name', 'job_role', 'workplace_name', 'department']) {
    assert.match(migration, new RegExp(`e\\.${field}`));
  }
  assert.match(migration, /join matched m on m\.pattern_fingerprint = r\.pattern_fingerprint/);
  assert.match(migration, /where r\.representative_rank = 1/);
});

test('grouped RPC is additive and authenticated-only; app previews representative id', () => {
  assert.match(existingSearch, /create function public\.search_shift_presets\(p_query text\)/);
  assert.doesNotMatch(migration, /drop function public\.search_shift_presets|create or replace function public\.search_shift_presets/);
  assert.match(migration, /create or replace function public\.search_shift_preset_groups\(p_query text\)/);
  assert.match(migration, /security definer set search_path to ''/);
  assert.match(migration, /revoke all on function public\.search_shift_preset_groups\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.search_shift_preset_groups\(text\) to authenticated, service_role/);
  assert.match(adapter, /supabase\.rpc\('search_shift_preset_groups', \{ p_query: displayQuery \}\)/);
  assert.match(adapter, /memberCount < 1/);
  assert.match(screen, /searchShiftPresetGroups\(displayQuery\)/);
  assert.match(screen, /key=\{patternFingerprint\}/);
  assert.match(screen, /reference: preset\.id/);
  assert.match(screen, /같은 패턴 근무표 \$\{memberCount\}개/);
});

test('group search adapter sends query and maps a representative with group count', async () => {
  const calls = [];
  const search = groupedSearchWith({ rpc: async (...args) => {
    calls.push(args);
    return { data: [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '회사 A',
      pattern_fingerprint: `v1:${'a'.repeat(64)}`, member_count: 2,
      job_role: '간호사', verification_count: 3,
    }], error: null };
  } });
  const result = await search(' 회사 B ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'search_shift_preset_groups');
  assert.equal(calls[0][1].p_query, '회사 B');
  assert.equal(result.length, 1);
  assert.equal(result[0].memberCount, 2);
  assert.equal(result[0].preset.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(result[0].verificationCount, 3);
});

test('group search adapter rejects missing fingerprints and invalid counts', async () => {
  for (const row of [{ id: 'x', member_count: 2 }, { id: 'x', pattern_fingerprint: `v1:${'b'.repeat(64)}`, member_count: 0 }]) {
    const search = groupedSearchWith({ rpc: async () => ({ data: [row], error: null }) });
    await assert.rejects(search('회사'), /Invalid shift preset group search response/);
  }
});
