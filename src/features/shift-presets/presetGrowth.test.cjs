const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { normalizePresetRequestQuery, createCandidateSafePreset } = require('./presetGrowth.ts');
const migration = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260928130000_add_preset_growth_foundations.sql'), 'utf8');

test('zero-result requests normalize case and whitespace with a length bound', () => {
  assert.deepEqual(normalizePresetRequestQuery('  4조  2교대  '), { displayQuery: '4조 2교대', normalizedQuery: '4조 2교대' });
  assert.equal(normalizePresetRequestQuery('  HYUNDAI\t병원 ').normalizedQuery, 'hyundai 병원');
  assert.throws(() => normalizePresetRequestQuery(' '.repeat(101)));
  assert.throws(() => normalizePresetRequestQuery('a'.repeat(81)));
});

test('candidate payload removes free-text notes and keeps conditional/team calculation data', () => {
  const preset = { id: 'local', name: '교대', source: 'mine', version: 1, description: 'private note',
    shiftTypes: [{ key: 'day', name: '일', abbreviation: '일', kind: 'work', color: '#fff', textColor: '#000', startTime: '09:00', endTime: '18:00', note: 'private note' }],
    pattern: ['day'], conditionalRules: [{ when: 'weekend', baseShiftKey: 'day', resolvedShiftKey: 'day' }], teamRotationTemplate: { version: 1, teams: [{ id: 'one', label: '1팀', patternIndexOffset: 0 }, { id: 'two', label: '2팀', patternIndexOffset: 1 }] } };
  const candidate = createCandidateSafePreset(preset);
  assert.equal(candidate.description, undefined);
  assert.equal(candidate.shiftTypes[0].note, undefined);
  assert.deepEqual(candidate.conditionalRules, preset.conditionalRules);
  assert.deepEqual(candidate.teamRotationTemplate, preset.teamRotationTemplate);
  assert.equal(preset.shiftTypes[0].note, 'private note');
});

test('migration guards candidate writes and verification by authenticated claim', () => {
  assert.match(migration, /on conflict\(normalized_query\) do update set request_count=/);
  assert.match(migration, /primary key\(preset_id, user_id\)/);
  assert.match(migration, /shift_preset_share_claims c where c\.share_id=v_share\.id and c\.user_id=v_user/);
  assert.match(migration, /created_by<>v_user/);
  assert.match(migration, /on conflict\(preset_id,user_id\) do nothing/);
  assert.match(migration, /revoke all on table public\.preset_verifications from public, anon, authenticated/);
  assert.match(migration, /security definer set search_path to ''/);
  assert.match(migration, /p_payload is null or public\.is_valid_shift_preset_payload\(p_payload\) is distinct from true/);
  assert.match(migration, /v_team - 'id' - 'label' - 'patternIndexOffset'/);
  assert.match(migration, /v_rule - 'when' - 'baseShiftKey' - 'resolvedShiftKey'/);
  assert.match(migration, /v_preset\.visibility <> 'unlisted'/);
});
