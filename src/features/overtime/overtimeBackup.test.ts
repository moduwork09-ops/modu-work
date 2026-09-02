import { strict as assert } from 'node:assert';

import { MODU_WORK_BACKUP_VERSION, parseModuWorkBackup } from '../backup/localDataBackup';
import { USER_SCOPED_LEGACY_STORAGE_KEYS } from '../data/resetAllUserData';
import { OVERTIME_ENTRIES_STORAGE_KEY } from './overtimeStorage';

const baseBackup = {
  backupVersion: MODU_WORK_BACKUP_VERSION,
  appDataVersion: 2,
  createdAt: '2026-09-02T00:00:00.000Z',
  shiftSettings: null,
  personalEvents: [],
  dateMemos: {},
  shiftDateOverrides: {},
  recentColors: [],
};

const overtimeEntry = {
  id: 'overtime-1',
  date: '2026-09-02',
  startTime: '22:00',
  endTime: '02:00',
  memo: '업무 마무리',
  createdAt: '2026-09-02T00:00:00.000Z',
};

assert.deepEqual(parseModuWorkBackup(JSON.stringify(baseBackup))?.overtimeEntries, []);
assert.deepEqual(parseModuWorkBackup(JSON.stringify({ ...baseBackup, overtimeEntries: [overtimeEntry] }))?.overtimeEntries, [overtimeEntry]);
assert.equal(parseModuWorkBackup(JSON.stringify({ ...baseBackup, overtimeEntries: [{ ...overtimeEntry, startTime: 'bad' }] })), null);
assert(USER_SCOPED_LEGACY_STORAGE_KEYS.includes(OVERTIME_ENTRIES_STORAGE_KEY));

console.log('overtime backup/reset fixtures passed');
