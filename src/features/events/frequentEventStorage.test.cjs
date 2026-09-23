const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, 'frequentEventStorage.ts');
const backupSource = fs.readFileSync(path.join(__dirname, '../backup/localDataBackup.ts'), 'utf8');
const resetSource = fs.readFileSync(path.join(__dirname, '../data/resetAllUserData.ts'), 'utf8');
const formSource = fs.readFileSync(path.join(__dirname, 'PersonalEventForm.tsx'), 'utf8');
const homeSource = fs.readFileSync(path.join(__dirname, '../../../app/(tabs)/index.tsx'), 'utf8');
const managerSource = fs.readFileSync(path.join(__dirname, '../../../app/frequent-events.tsx'), 'utf8');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const values = new Map();
const moduleValue = { exports: {} };
const requireMock = (name) => {
  if (name.includes('async-storage')) return { default: { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value) } };
  if (name.endsWith('/userScopedStorage')) return { getUserScopedStorageKey: (owner, key) => `modu-work.user.${owner}.${key}` };
  throw new Error(`Unexpected import: ${name}`);
};
vm.runInNewContext(js, { module: moduleValue, exports: moduleValue.exports, require: requireMock, console }, { filename: file });
const { parseFrequentEventTemplates, loadFrequentEventTemplates, saveFrequentEventTemplates } = moduleValue.exports;

const template = { id: 'f1', title: '등원', startTime: '08:00', endTime: '09:00', color: '#ABCDEF' };
assert.equal(JSON.stringify(parseFrequentEventTemplates(JSON.stringify({ version: 1, templates: [template] }))), JSON.stringify([template]));
for (const invalid of [null, {}, { version: 1, templates: [{ ...template, startTime: '25:00' }] }, { version: 1, templates: [{ ...template, endTime: '07:00' }] }]) {
  assert.equal(parseFrequentEventTemplates(JSON.stringify(invalid)), null);
}
assert.match(backupSource, /frequentEventTemplates\?: FrequentEventTemplate\[\]/);
assert.match(backupSource, /parsed\.frequentEventTemplates === undefined \? \[\]/, 'legacy backup restores with empty template list');
assert.match(resetSource, /FREQUENT_EVENTS_STORAGE_KEY/);
assert.match(formSource, /const applyTemplate = .*setTitle\(template\.title\).*setStartTime\(template\.startTime\).*setEndTime\(template\.endTime\).*setEventColor\(template\.color\)/);
assert.doesNotMatch(formSource.match(/const applyTemplate = .*?;/)?.[0] ?? '', /savePersonalEvent/, 'quick chip only prefills the existing form');
assert.match(homeSource, /pathname: '\/events\/new', params: \{ date: todayDate \}/, 'home CTA prefills today in the existing event route');
assert.match(managerSource, /setEditingId\(template\.id\)/);
assert.match(managerSource, /templates\.filter\(\(item\) => item\.id !== target\.id\)/);

(async () => {
  await saveFrequentEventTemplates('A', [template]);
  assert.equal(JSON.stringify(await loadFrequentEventTemplates('A')), JSON.stringify([template]));
  assert.equal(JSON.stringify(await loadFrequentEventTemplates('B')), '[]', 'templates are account scoped');
  console.log('PASS frequent event templates: validation, save/load, A/B isolation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
