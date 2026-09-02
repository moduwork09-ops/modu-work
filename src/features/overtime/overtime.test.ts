import { strict as assert } from 'node:assert';

import {
  formatOvertimeCalendarBadge,
  getOvertimeDateTotalMinutes,
  getOvertimeDurationMinutes,
  getOvertimeMonthTotalMinutes,
  parseBackupOvertimeEntries,
  type OvertimeEntry,
} from './overtime';
import { createOvertimeEntryStore } from './overtimeStorage';

const entry = (id: string, date: string, startTime: string, endTime: string): OvertimeEntry => ({
  id,
  date,
  startTime,
  endTime,
  createdAt: '2026-09-02T00:00:00.000Z',
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
}

async function run() {
  assert.equal(getOvertimeDurationMinutes('18:00', '20:00'), 120);
  assert.equal(getOvertimeDurationMinutes('22:00', '02:00'), 240);
  assert.equal(getOvertimeDurationMinutes('18:00', '18:00'), null);

  const entries = [
    entry('morning', '2026-09-02', '07:00', '08:00'),
    entry('evening', '2026-09-02', '18:00', '20:00'),
    entry('overnight', '2026-09-03', '22:00', '02:00'),
    entry('other-month', '2026-10-01', '09:00', '10:00'),
  ];
  assert.equal(getOvertimeDateTotalMinutes(entries, '2026-09-02'), 180);
  assert.equal(getOvertimeDateTotalMinutes(entries, '2026-09-03'), 240);
  assert.equal(getOvertimeMonthTotalMinutes(entries, 2026, 9), 420);
  assert.equal(formatOvertimeCalendarBadge(30), '초과 30m');
  assert.equal(formatOvertimeCalendarBadge(90), '초과 1h 30m');

  const storage = memoryStorage();
  const store = createOvertimeEntryStore(storage);
  await store.save('A', entries);
  assert.equal(store.getStorageKey('A'), 'modu-work.user.A.overtime-entries.v1');
  assert.deepEqual(await store.load('A'), { status: 'ready', entries });
  assert.deepEqual(await store.load('B'), { status: 'ready', entries: [] });

  const backupEntries = [...entries];
  storage.values.delete(store.getStorageKey('A'));
  assert.deepEqual(await store.load('A'), { status: 'ready', entries: [] });
  await store.save('A', backupEntries);
  assert.deepEqual(await store.load('A'), { status: 'ready', entries: backupEntries });

  assert.deepEqual(parseBackupOvertimeEntries(undefined), []);
  assert.deepEqual(parseBackupOvertimeEntries(entries), entries);
  assert.equal(parseBackupOvertimeEntries([{ ...entries[0], startTime: 'bad' }]), null);

  const afterDelete = entries.filter((item) => item.id !== 'evening');
  assert.equal(getOvertimeDateTotalMinutes(afterDelete, '2026-09-02'), 60);
  console.log('overtime fixtures passed');
}

void run();
