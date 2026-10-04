const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { canonicalizePresetPattern } = require('./presetFingerprint.ts');
const { builtinShiftPresets } = require('./builtinShiftPresets.ts');
const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261004130000_add_shift_preset_pattern_fingerprints.sql'), 'utf8');

const D = { key: 'D', name: '주간', abbreviation: '주', kind: 'work', startTime: '08:00', endTime: '20:00', color: '#111', textColor: '#fff' };
const N = { key: 'N', name: '야간', abbreviation: '야', kind: 'work', startTime: '20:00', endTime: '08:00', color: '#222', textColor: '#fff' };
const O = { key: 'O', name: '휴무', abbreviation: '휴', kind: 'rest', color: '#333', textColor: '#fff' };
function preset(overrides = {}) {
  return { id: 'private-A', version: 1, source: 'mine', name: '나의 교대', description: 'memo', organizationName: 'A',
    shiftTypes: [D, N, O], pattern: ['D', 'D', 'N', 'N', 'O', 'O'], ...overrides };
}
const fingerprint = value => `v1:${createHash('sha256').update(canonicalizePresetPattern(value), 'utf8').digest('hex')}`;
function same(left, right) { assert.equal(fingerprint(left), fingerprint(right)); }
function different(left, right) { assert.notEqual(fingerprint(left), fingerprint(right)); }

test('key, display fields, shift array order and starting phase do not affect cycle identity', () => {
  const base = preset();
  const renamed = preset({ id: 'private-B', name: '다른 이름', organizationName: 'B', description: undefined,
    initialPatternIndex: 4, shiftTypes: [
      { ...O, key: 'rest', name: 'Off', abbreviation: 'O', color: '#fff', textColor: '#000' },
      { ...N, key: 'night', name: 'Night', abbreviation: 'N', color: '#fff', textColor: '#000' },
      { ...D, key: 'day', name: 'Day', abbreviation: 'D', color: '#fff', textColor: '#000' },
    ], pattern: ['rest', 'rest', 'day', 'day', 'night', 'night'] });
  same(base, renamed);
  assert.equal(canonicalizePresetPattern(base), canonicalizePresetPattern(renamed));
  assert.match(fingerprint(base), /^v1:[0-9a-f]{64}$/);
  different(base, preset({ shiftTypes: [{ ...D, startTime: '07:00', endTime: '19:00' }, N, O] }));
  different(base, preset({ pattern: ['D', 'N', 'D', 'N', 'O', 'O'] }));
  different(preset({ pattern: ['D', 'N', 'O'] }), preset({ pattern: ['O', 'N', 'D'] }));
});

test('conditional rules use calculation signatures and preserve first-match outcomes', () => {
  const rules = [
    { when: 'weekend', baseShiftKey: 'D', resolvedShiftKey: 'O' },
    { when: 'koreanHoliday', baseShiftKey: 'N', resolvedShiftKey: 'O' },
  ];
  const withRules = preset({ conditionalRules: rules });
  const weekendOnly = canonicalizePresetPattern(preset({ conditionalRules: [rules[0]] }));
  assert.match(weekendOnly, /weekend>rest:-:-}\[work:08:00:20:00,rest:-:-,work:08:00:20:00,rest:-:-\]/, 'weekend-only rule does not apply on a weekday holiday');
  same(withRules, preset({ conditionalRules: [...rules].reverse() }));
  same(withRules, preset({ shiftTypes: [{ ...D, key: 'day' }, { ...N, key: 'night' }, { ...O, key: 'rest' }],
    pattern: ['day', 'day', 'night', 'night', 'rest', 'rest'], conditionalRules: [
      { when: 'weekend', baseShiftKey: 'day', resolvedShiftKey: 'rest' },
      { when: 'koreanHoliday', baseShiftKey: 'night', resolvedShiftKey: 'rest' },
    ] }));
  different(withRules, preset());
  different(withRules, preset({ conditionalRules: rules.map(rule => ({ ...rule, when: 'koreanHoliday' })) }));
  different(withRules, preset({ conditionalRules: rules.map(rule => ({ ...rule, when: 'weekend' })) }));
  different(withRules, preset({ conditionalRules: [{ ...rules[0], resolvedShiftKey: 'N' }, rules[1]] }));
  const overlap = [
    { when: 'weekend', baseShiftKey: 'D', resolvedShiftKey: 'O' },
    { when: 'koreanHoliday', baseShiftKey: 'D', resolvedShiftKey: 'N' },
  ];
  different(preset({ conditionalRules: overlap }), preset({ conditionalRules: [...overlap].reverse() }));
  const sameHoursDifferentRule = preset({ shiftTypes: [D, { ...D, key: 'D2' }, O], pattern: ['D', 'D', 'D2'],
    conditionalRules: [{ when: 'weekend', baseShiftKey: 'D', resolvedShiftKey: 'O' }] });
  different(sameHoursDifferentRule, preset({ ...sameHoursDifferentRule, pattern: ['D', 'D2', 'D2'] }));
});

test('team identities and global phase shift are ignored, relative offsets and count are retained', () => {
  const team = offsets => ({ version: 1, teams: offsets.map((patternIndexOffset, index) => ({ id: `team-${index}`, label: `${index}팀`, patternIndexOffset })) });
  const pattern = ['D', 'N', 'O', 'D'];
  const base = preset({ pattern, teamRotationTemplate: team([0, 1, 2, 3]) });
  same(base, preset({ pattern, teamRotationTemplate: { version: 1, teams: [2, 3, 0, 1].map((patternIndexOffset, index) => ({ id: `group-${index}`, label: `조 ${index}`, patternIndexOffset })) } }));
  different(base, preset({ pattern }));
  different(base, preset({ pattern, teamRotationTemplate: team([0, 1, 2]) }));
  different(base, preset({ pattern, teamRotationTemplate: team([0, 2, 1, 3]) }));
});

test('six-team duty identity retains its conditional rule and relative six-phase rotation', () => {
  const duty = builtinShiftPresets.find(value => value.id === 'builtin-six-team-duty');
  const relabeled = structuredClone(duty);
  relabeled.initialPatternIndex = 4;
  relabeled.teamRotationTemplate.teams.forEach((team, index) => {
    team.id = `alternate-${index}`;
    team.label = `조 ${index}`;
    team.patternIndexOffset = (team.patternIndexOffset + 2) % 6;
  });
  same(duty, relabeled);
  different(duty, { ...duty, conditionalRules: undefined });
});

test('server migration backfills and hashes only after validating candidate payload', () => {
  assert.match(sql, /add column pattern_fingerprint text/);
  assert.match(sql, /update public\.shift_preset_candidates\s+set pattern_fingerprint = public\.shift_preset_pattern_fingerprint\(payload\)/);
  assert.match(sql, /create index shift_preset_candidates_pattern_fingerprint_idx/);
  assert.match(sql, /public\.is_safe_preset_candidate_payload\(p_payload\) is distinct from true/);
  assert.match(sql, /pg_catalog\.sha256\(pg_catalog\.convert_to\(c\.canonical, 'UTF8'\)\)/);
  assert.match(sql, /v_rules := pg_catalog\.array_append\(v_rules, \(v_rule->>'when'\) \|\| '>' \|\| v_resolved\)/);
  assert.match(sql, /v_resolved := v_signatures->>\(v_rule->>'resolvedShiftKey'\)/);
  assert.match(sql, /v_rule->>'when' <> 'weekend'.*v_holiday/, 'SQL also excludes weekend-only rules on weekday holidays');
  assert.match(sql, /v_rotation collate "C" < v_best collate "C"/);
  assert.match(sql, /pattern_fingerprint=excluded\.pattern_fingerprint/);
  assert.match(sql, /v_fingerprint := public\.shift_preset_pattern_fingerprint\(p_payload\)/);
  assert.match(sql, /security definer set search_path to ''/);
  assert.match(sql, /revoke all on function .*submit_shift_preset_candidate\(uuid,jsonb,text,text,text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.submit_shift_preset_candidate\(uuid,jsonb,text,text,text\) to authenticated/);
  assert.doesNotMatch(sql, /p_pattern_fingerprint/);
});
