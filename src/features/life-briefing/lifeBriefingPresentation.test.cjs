const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { calculateMonthSummary, calculateWeeklyBriefing } = require('./lifeBriefing.ts');
const { getBriefingHero, getBriefingTypeSlices, getBriefingRecommendationCopy, getBriefingComments } = require('./lifeBriefingPresentation.ts');

const shiftTypes = [
  { id: 'day', name: '아주 긴 사용자 정의 주간 근무 유형 이름', abbreviation: '주', kind: 'work', startTime: '09:00', endTime: '18:00', color: '#f0d', textColor: '#111' },
  { id: 'night', name: '야간', abbreviation: '야', kind: 'work', startTime: '19:00', endTime: '09:00', color: '#123', textColor: '#fff' },
  { id: 'duty', name: '당직', abbreviation: '당', kind: 'work', startTime: '09:00', endTime: '09:00', color: '#abc', textColor: '#111' },
  { id: 'early', name: '조조', abbreviation: '조', kind: 'work', startTime: '05:00', endTime: '13:00', color: '#def', textColor: '#111' },
  { id: 'rest', name: '휴무', abbreviation: '휴', kind: 'rest', color: '#ded', textColor: '#111' },
];
const entry = { id: 'fixture', effectiveFrom: '2026-10-01', anchorDate: '2026-10-01', anchorPatternIndex: 0, createdAt: '2026-10-01T00:00:00Z', pattern: ['day', 'night', 'duty', 'early', 'rest'] };
const schedule = { shiftTypes, shiftPattern: entry.pattern, anchorDate: entry.anchorDate, anchorPatternIndex: 0, patternHistory: [entry], shiftDateOverrides: {} };

test('hero acknowledges unknown days instead of claiming a full-month comparison', () => {
  const before = calculateMonthSummary('2026-09', schedule);
  const current = calculateMonthSummary('2026-10', schedule);
  assert.equal(before.unknownDays, 30);
  assert.match(getBriefingHero(before, before).detail, /미확인 30일/);
  assert.ok(getBriefingHero(current, before).title.length > 0);
});

test('donut presentation keeps top three types and merges all remaining work types', () => {
  const month = calculateMonthSummary('2026-10', schedule);
  const slices = getBriefingTypeSlices(month);
  assert.equal(slices.length, 4);
  assert.equal(slices[3].name, '기타');
  assert.equal(slices.reduce((sum, item) => sum + item.count, 0), month.workDays);
  assert.ok(slices.some(item => item.name === '아주 긴 사용자 정의 주간 근무 유형 이름'));
});

test('no rest recommendation has safe empty copy; comments stay focused on work and rest', () => {
  const allWorkEntry = { ...entry, pattern: ['day'] };
  const allWork = { ...schedule, shiftPattern: allWorkEntry.pattern, patternHistory: [allWorkEntry] };
  const week = calculateWeeklyBriefing('2026-10-19', allWork);
  const copy = getBriefingRecommendationCopy(week, allWork);
  assert.equal(copy.rest, null);
  assert.equal(getBriefingComments(calculateMonthSummary('2026-10', allWork)).length, 2);
});

test('five and six week months both fit the dynamic chart model', () => {
  assert.equal(calculateMonthSummary('2026-10', schedule).weekly.length, 5);
  assert.equal(calculateMonthSummary('2026-08', { ...schedule, patternHistory: [], anchorDate: '2026-08-01' }).weekly.length, 6);
});
