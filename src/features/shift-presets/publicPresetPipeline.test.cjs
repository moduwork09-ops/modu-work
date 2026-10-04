const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const ui = fs.readFileSync(path.join(root, 'app/shift-presets/share.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261004140000_connect_public_preset_approval.sql'), 'utf8');
const previous = fs.readFileSync(path.join(root, 'supabase/migrations/20261004130000_add_shift_preset_pattern_fingerprints.sql'), 'utf8');
const search = fs.readFileSync(path.join(root, 'supabase/migrations/20260928130000_add_preset_growth_foundations.sql'), 'utf8');

function screenFunction(name, sandbox) {
  const source = ts.createSourceFile('share.tsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let target;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) target = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(target, `${name} must exist`);
  const code = ts.transpileModule(`${target.getText(source)}\nexports.result = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  sandbox.exports = {};
  vm.runInNewContext(code, sandbox);
  return sandbox.exports.result;
}

function screenContext(visibility) {
  const calls = [];
  const sandbox = {
    lock: { current: false }, name: '근무표', org: '병원', visibility, code: '', created: undefined,
    jobRole: '간호사', department: '병동', shiftTypes: [], shiftPattern: [], anchorPatternIndex: 0,
    patternHistory: [], teamRotation: undefined, candidateSubmitted: false,
    createShiftPresetSnapshot: () => ({ name: '근무표', organizationName: '병원' }),
    createServerShiftPreset: async (_preset, requestedVisibility) => { calls.push(['preset', requestedVisibility]); return 'preset-id'; },
    createShiftPresetShare: async (_id, mode) => { calls.push(['share', mode]); return 'MW-CODE'; },
    submitShiftPresetCandidate: async (id, _preset, metadata) => { calls.push(['candidate', id, metadata.jobRole, metadata.department]); },
    setLoading: value => { sandbox.loading = value; },
    setCreated: value => { sandbox.created = value; },
    setCode: value => { sandbox.code = value; },
    setCandidateSubmitted: value => { sandbox.candidateSubmitted = value; },
    Alert: { alert: (...args) => calls.push(['alert', ...args]) },
  };
  return { sandbox, calls };
}

test('search-public request creates a private preset, code, then fingerprint candidate', async () => {
  const { sandbox, calls } = screenContext('public');
  await screenFunction('create', sandbox)('single');
  assert.deepEqual(calls, [
    ['preset', 'unlisted'], ['share', 'single'], ['candidate', 'preset-id', '간호사', '병동'],
  ]);
  assert.equal(sandbox.code, 'MW-CODE');
  assert.equal(sandbox.candidateSubmitted, true);
  assert.match(ui, /검색 공개 요청/);
  assert.match(ui, /승인 후 검색에 표시/);
});

test('link-only sharing keeps candidate submission optional', async () => {
  const { sandbox, calls } = screenContext('unlisted');
  await screenFunction('create', sandbox)('reusable');
  assert.deepEqual(calls, [['preset', 'unlisted'], ['share', 'reusable']]);
  assert.equal(sandbox.candidateSubmitted, false);
  assert.match(ui, /visibility === 'unlisted' \? <Card/);
  assert.match(ui, /프리셋 제공 동의/);
});

test('failed public candidate submission preserves its code and retries against the same preset', async () => {
  const { sandbox, calls } = screenContext('public');
  sandbox.submitShiftPresetCandidate = async () => { throw new Error('offline'); };
  await screenFunction('create', sandbox)('single');
  assert.equal(sandbox.code, 'MW-CODE');
  assert.equal(sandbox.created.id, 'preset-id');
  assert.equal(sandbox.candidateSubmitted, false);
  assert(calls.some(call => call[0] === 'alert' && call[1].includes('제출하지 못했어요')));
  sandbox.submitShiftPresetCandidate = async id => { calls.push(['retry', id]); };
  await screenFunction('submitCandidate', sandbox)();
  assert.deepEqual(calls.filter(call => call[0] === 'retry'), [['retry', 'preset-id']]);
  assert.equal(sandbox.candidateSubmitted, true);
});

test('creation lock rejects a second tap while the first request is pending', async () => {
  const { sandbox, calls } = screenContext('public');
  let resolve;
  sandbox.createServerShiftPreset = () => new Promise(done => { calls.push(['preset']); resolve = done; });
  const create = screenFunction('create', sandbox);
  const first = create('single');
  await create('single');
  assert.equal(calls.filter(call => call[0] === 'preset').length, 1);
  resolve('preset-id');
  await first;
});

test('review migration prevents direct public creation and promotes approved candidates atomically', () => {
  assert.match(migration, /p_visibility is distinct from 'unlisted'/);
  assert.match(migration, /values \(pg_catalog\.btrim\(p_name\), nullif\(pg_catalog\.btrim\(p_organization_name\), ''\), p_payload, 'unlisted', v_user\)/);
  assert.match(migration, /create function public\.review_shift_preset_candidate\(p_candidate_id uuid, p_decision text\)/);
  assert.match(migration, /p_decision not in \('approved', 'rejected'\)/);
  assert.match(migration, /select preset_id into v_preset_id from public\.shift_preset_candidates where id=p_candidate_id/);
  assert.match(migration, /from public\.shift_presets where id=v_preset_id for update/);
  assert.match(migration, /from public\.shift_preset_candidates where id=p_candidate_id for update/);
  assert(migration.indexOf('from public.shift_presets where id=v_preset_id for update') < migration.indexOf('from public.shift_preset_candidates where id=p_candidate_id for update'), 'review locks preset before candidate');
  assert.match(migration, /v_candidate\.status <> 'pending' or v_preset\.visibility <> 'unlisted'/);
  assert.match(migration, /v_candidate\.pattern_fingerprint is null/);
  assert.match(migration, /if p_decision='approved' then\s+update public\.shift_presets\s+set visibility='public'/);
  assert.match(migration, /revoke all on function .*review_shift_preset_candidate\(uuid,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.review_shift_preset_candidate\(uuid,text\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.review_shift_preset_candidate\(uuid,text\) to authenticated/);
  assert.match(search, /where auth\.uid\(\) is not null and p\.visibility='public' and p\.revoked_at is null/);
  assert.match(previous, /on conflict\(preset_id\) do update set .*pattern_fingerprint=excluded\.pattern_fingerprint/);
  assert.match(previous, /where public\.shift_preset_candidates\.created_by=v_user and public\.shift_preset_candidates\.status='pending'/);
});
