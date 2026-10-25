const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { basicStickerNames, isBasicStickerKey, selectRepresentativeSticker, suggestStickerKey } = require('./stickerPolicy.ts');
const { createMonthlyWidgetSnapshot } = require('../widget/monthlyWidgetSnapshot.ts');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../storage/userScopedStorage') return {};
  if (request === './memoPresentation') return { DEFAULT_MEMO_COLOR: '#FFF1A8' };
  return originalLoad.call(this, request, parent, isMain);
};
const { parsePersistedDateMemos } = require('../memos/dateMemoStorage.ts');
Module._load = originalLoad;
const { parsePersonalEventsValue } = require('../events/personalEventValidation.ts');

test('the free basic pack has 16 matching app and widget assets', () => {
  const keys = Object.keys(basicStickerNames);
  assert.equal(keys.length, 16);
  for (const key of keys) {
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../../assets/stickers/basic', key + '.png')));
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../../modules/modu-work-widget/android/src/main/res/drawable-nodpi', 'sticker_basic_' + key + '.png')));
  }
  assert.equal(isBasicStickerKey('basic', 'missing'), false);
  assert.equal(isBasicStickerKey('paid', 'birthday'), false);
});

test('representative prefers all-day then earlier time, counts only valid extras', () => {
  const result = selectRepresentativeSticker([
    { id: 'later', stickerKey: 'cafe', allDay: false, startTime: '18:00' },
    { id: 'bad', stickerKey: 'missing', allDay: true, startTime: null },
    { id: 'early', stickerKey: 'meal', allDay: false, startTime: '09:00' },
    { id: 'all', stickerKey: 'birthday', allDay: true, startTime: null },
  ]);
  assert.deepEqual(result, { stickerKey: 'birthday', stickerPackId: 'basic', additionalCount: 2 });
  assert.equal(selectRepresentativeSticker([{ id: 'old', allDay: false, startTime: null }]), null);
  assert.equal(suggestStickerKey('가족 여행'), 'travel');
  assert.equal(suggestStickerKey('일상'), null);
});

test('widget snapshot carries one valid representative without changing info rows', () => {
  const shifts = [{ id: 'rest', name: '휴무', abbreviation: '휴', kind: 'rest', color: '#EEEEEE', textColor: '#333333' }];
  const snapshot = createMonthlyWidgetSnapshot({
    shiftTypes: shifts, shiftPattern: ['rest'], anchorDate: '2026-10-01', anchorPatternIndex: 0,
    patternHistory: [], shiftDateOverrides: {},
    dateMemos: { '2026-10-25': [
      { id: 'one', text: '생일과 긴 메모', color: '#FFFFFF', timeEnabled: true, allDay: true, startTime: null, endTime: null, reminderMinutes: null, notificationId: null, stickerKey: 'birthday', stickerPackId: 'basic' },
      { id: 'two', text: '병원', color: '#FFFFFF', timeEnabled: true, allDay: false, startTime: '11:00', endTime: '12:00', reminderMinutes: null, notificationId: null, stickerKey: 'hospital' },
    ] }, personalEvents: [],
  }, new Date('2026-10-25T12:00:00Z'));
  const cell = snapshot.months[12].cells.find(item => item.date === '2026-10-25');
  assert.equal(cell.stickerKey, 'birthday');
  assert.equal(cell.stickerPackId, 'basic');
  assert.equal(cell.infoRows.length, 2);
  assert.equal(snapshot.months[12].cells.find(item => item.date === '2026-10-24').stickerKey, null);
});

test('existing local schedules load without stickers; edit and remove survive parsing', () => {
  const base = { id: 'one', text: '병원', color: '#FFFFFF', timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null };
  const encode = memo => JSON.stringify({ version: 1, memos: { '2026-10-25': [memo] } });
  assert.equal(parsePersistedDateMemos(encode(base))['2026-10-25'][0].stickerKey, null);
  assert.equal(parsePersistedDateMemos(encode({ ...base, stickerKey: 'hospital', stickerPackId: 'basic' }))['2026-10-25'][0].stickerKey, 'hospital');
  assert.equal(parsePersistedDateMemos(encode({ ...base, stickerKey: null, stickerPackId: null }))['2026-10-25'][0].stickerKey, null);
  assert.equal(parsePersistedDateMemos(encode({ ...base, stickerKey: 7 })), null);
  const event = { id: 'e1', title: '여행', date: '2026-10-25', allDay: true, startTime: null, endTime: null, memo: '', stickerKey: 'travel', stickerPackId: 'basic' };
  assert.equal(parsePersonalEventsValue(JSON.stringify({ version: 1, events: [event] }))[0].stickerKey, 'travel');
});
