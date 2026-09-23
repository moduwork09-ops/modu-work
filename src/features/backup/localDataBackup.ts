import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { RECENT_COLORS_STORAGE_KEY } from '../colors/recentColorStorage';
import {
  DATE_MEMOS_STORAGE_KEY,
  DATE_MEMOS_STORAGE_VERSION,
  parsePersistedDateMemos,
  type DateMemos,
} from '../memos/dateMemoStorage';
import {
  parsePersonalEvents,
  PERSONAL_EVENTS_STORAGE_KEY,
  PERSONAL_EVENTS_STORAGE_VERSION,
  type PersonalEvent,
} from '../events/personalEventStorage';
import {
  parsePersistedShiftSettings,
  SHIFT_SETTINGS_STORAGE_KEY,
  SHIFT_SETTINGS_STORAGE_VERSION,
  type PersistedShiftSettings,
} from '../shifts/shiftSettingsStorage';
import {
  parseShiftDateOverrides,
  SHIFT_DATE_OVERRIDES_STORAGE_KEY,
  SHIFT_DATE_OVERRIDES_STORAGE_VERSION,
  type ShiftDateOverrides,
} from '../shifts/shiftDateOverrideStorage';
import { getCurrentUserScopedStorageKey, readUserScopedStorageValue } from '../storage/userScopedStorage';
import { parseSalarySettings, SALARY_SETTINGS_STORAGE_KEY } from '../salary/salaryStorage';
import type { SalarySettings } from '../salary/salaryTypes';
import {
  OVERTIME_STORAGE_VERSION,
  parseBackupOvertimeEntries,
  parseOvertimeEntries,
  type OvertimeEntry,
} from '../overtime/overtime';
import { OVERTIME_ENTRIES_STORAGE_KEY } from '../overtime/overtimeStorage';

import { MONTHLY_MEMOS_STORAGE_KEY, MONTHLY_MEMOS_STORAGE_VERSION, parseMonthlyMemos, type MonthlyMemos } from '../memos/monthlyMemo';
import { FREQUENT_EVENTS_STORAGE_KEY, FREQUENT_EVENTS_STORAGE_VERSION, parseFrequentEventTemplates, type FrequentEventTemplate } from '../events/frequentEventStorage';

export const MODU_WORK_BACKUP_VERSION = 1 as const;

export type ModuWorkBackup = {
  backupVersion: typeof MODU_WORK_BACKUP_VERSION;
  appDataVersion: number;
  createdAt: string;
  shiftSettings: PersistedShiftSettings | null;
  personalEvents: PersonalEvent[];
  dateMemos: DateMemos;
  monthlyMemos?: MonthlyMemos;
  shiftDateOverrides: ShiftDateOverrides;
  recentColors: string[];
  salarySettings?: SalarySettings | null;
  overtimeEntries?: OvertimeEntry[];
  frequentEventTemplates?: FrequentEventTemplate[];
};

const STORAGE_KEYS = [SHIFT_SETTINGS_STORAGE_KEY, PERSONAL_EVENTS_STORAGE_KEY, DATE_MEMOS_STORAGE_KEY, SHIFT_DATE_OVERRIDES_STORAGE_KEY, RECENT_COLORS_STORAGE_KEY, SALARY_SETTINGS_STORAGE_KEY, OVERTIME_ENTRIES_STORAGE_KEY, MONTHLY_MEMOS_STORAGE_KEY, FREQUENT_EVENTS_STORAGE_KEY] as const;
const HEX_COLOR = /^#[0-9A-F]{6}$/;
const MAX_RECENT_COLORS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredData(values: readonly (string | null)[]) {
  const [shiftSettingsValue, personalEventsValue, dateMemosValue, shiftOverridesValue, recentColorsValue, salarySettingsValue, overtimeEntriesValue, monthlyMemosValue, frequentEventsValue] = values;
  const monthlyMemos = monthlyMemosValue == null ? {} : parseMonthlyMemos(monthlyMemosValue);
  if (!monthlyMemos) throw new Error('월간 메모가 유효하지 않아 백업할 수 없습니다.');
  const shiftSettings = shiftSettingsValue ? parsePersistedShiftSettings(shiftSettingsValue) : null;
  const personalEvents = personalEventsValue ? parsePersonalEvents(personalEventsValue) : [];
  const dateMemos = dateMemosValue ? parsePersistedDateMemos(dateMemosValue) : {};
  const shiftDateOverrides = shiftOverridesValue ? parseShiftDateOverrides(shiftOverridesValue) : {};
  let recentColors: unknown = [];
  if (recentColorsValue) {
    try {
      recentColors = JSON.parse(recentColorsValue);
    } catch {
      recentColors = null;
    }
  }

  if ((shiftSettingsValue && !shiftSettings)
    || (personalEventsValue && !personalEvents)
    || (dateMemosValue && !dateMemos)
    || (shiftOverridesValue && !shiftDateOverrides)
    || !Array.isArray(recentColors)
    || recentColors.length > MAX_RECENT_COLORS
    || !recentColors.every((color) => typeof color === 'string' && HEX_COLOR.test(color))) {
    throw new Error('현재 저장 데이터가 유효하지 않아 백업할 수 없습니다.');
  }
  const salarySettings = salarySettingsValue === null ? null : parseSalarySettings(salarySettingsValue);
  if (salarySettingsValue !== null && !salarySettings) throw new Error('현재 급여 설정이 유효하지 않아 백업할 수 없습니다.');
  const overtimeEntries = overtimeEntriesValue === null ? [] : parseOvertimeEntries(overtimeEntriesValue);
  if (!overtimeEntries) throw new Error('현재 초과근무 데이터가 유효하지 않아 백업할 수 없습니다.');
  const frequentEventTemplates = frequentEventsValue === null ? [] : parseFrequentEventTemplates(frequentEventsValue);
  if (!frequentEventTemplates) throw new Error('자주 쓰는 일정 데이터가 유효하지 않아 백업할 수 없습니다.');

  return {
    shiftSettings,
    personalEvents: personalEvents ?? [],
    dateMemos: dateMemos ?? {},
    monthlyMemos,
    shiftDateOverrides: shiftDateOverrides ?? {},
    recentColors,
    salarySettings,
    overtimeEntries,
    frequentEventTemplates,
  };
}

export function parseModuWorkBackup(value: string): ModuWorkBackup | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)
      || parsed.backupVersion !== MODU_WORK_BACKUP_VERSION
      || parsed.appDataVersion !== SHIFT_SETTINGS_STORAGE_VERSION
      || typeof parsed.createdAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.createdAt))
      || !Array.isArray(parsed.personalEvents)
      || !isRecord(parsed.dateMemos)) return null;

    const hasValidShiftSettingsEnvelope = parsed.shiftSettings === null
      || (isRecord(parsed.shiftSettings)
        && parsed.shiftSettings.version === SHIFT_SETTINGS_STORAGE_VERSION
        && Array.isArray(parsed.shiftSettings.patternHistory));
    if (!hasValidShiftSettingsEnvelope) return null;

    const shiftSettings = parsed.shiftSettings === null
      ? null
      : parsePersistedShiftSettings(JSON.stringify(parsed.shiftSettings));
    const personalEvents = parsePersonalEvents(JSON.stringify({
      version: PERSONAL_EVENTS_STORAGE_VERSION,
      events: parsed.personalEvents,
    }));
    const dateMemos = parsePersistedDateMemos(JSON.stringify({
      version: DATE_MEMOS_STORAGE_VERSION,
      memos: parsed.dateMemos,
    }));
    const shiftDateOverrides = parseShiftDateOverrides(JSON.stringify({
      version: SHIFT_DATE_OVERRIDES_STORAGE_VERSION,
      overrides: isRecord(parsed.shiftDateOverrides) ? parsed.shiftDateOverrides : {},
    }));
    const monthlyMemos = parseMonthlyMemos(JSON.stringify({ version: MONTHLY_MEMOS_STORAGE_VERSION, memos: parsed.monthlyMemos === undefined ? {} : parsed.monthlyMemos }));
    if (!monthlyMemos) return null;
    const recentColors = parsed.recentColors === undefined ? [] : parsed.recentColors;
    const salarySettings = parsed.salarySettings === undefined
      ? undefined
      : parsed.salarySettings === null
        ? null
        : parseSalarySettings(JSON.stringify(parsed.salarySettings));
    const overtimeEntries = parseBackupOvertimeEntries(parsed.overtimeEntries);
    const frequentEventTemplates = parseFrequentEventTemplates(JSON.stringify({ version: FREQUENT_EVENTS_STORAGE_VERSION, templates: parsed.frequentEventTemplates === undefined ? [] : parsed.frequentEventTemplates }));

    if ((parsed.shiftSettings !== null && !shiftSettings)
      || !personalEvents
      || !dateMemos
      || !shiftDateOverrides
      || !overtimeEntries
      || !frequentEventTemplates
      || !Array.isArray(recentColors)
      || recentColors.length > MAX_RECENT_COLORS
      || !recentColors.every((color) => typeof color === 'string' && HEX_COLOR.test(color))) return null;
    if (parsed.salarySettings !== undefined && parsed.salarySettings !== null && !salarySettings) return null;
    if (shiftSettings && !Object.values(shiftDateOverrides).every((override) => shiftSettings.shiftTypes.some((shiftType) => shiftType.id === override.shiftTypeId))) return null;

    return {
      backupVersion: MODU_WORK_BACKUP_VERSION,
      appDataVersion: SHIFT_SETTINGS_STORAGE_VERSION,
      createdAt: parsed.createdAt,
      shiftSettings,
      personalEvents,
      dateMemos,
      monthlyMemos,
      shiftDateOverrides,
      recentColors,
      salarySettings,
      overtimeEntries,
      frequentEventTemplates,
    };
  } catch {
    return null;
  }
}

export async function createAndShareLocalBackup() {
  const values = await Promise.all(STORAGE_KEYS.map((key) => readUserScopedStorageValue(key)));
  const data = parseStoredData(values);
  const backup: ModuWorkBackup = {
    backupVersion: MODU_WORK_BACKUP_VERSION,
    appDataVersion: SHIFT_SETTINGS_STORAGE_VERSION,
    createdAt: new Date().toISOString(),
    ...data,
  };
  const date = backup.createdAt.slice(0, 10);
  const file = new File(Paths.cache, `modu-work-backup-${date}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup, null, 2));

  if (!await Sharing.isAvailableAsync()) {
    throw new Error('이 기기에서는 파일 공유 기능을 사용할 수 없습니다.');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: '모두의 근무 데이터 백업',
    mimeType: 'application/json',
    UTI: 'public.json',
  });

  return file.name;
}

export async function pickLocalBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;

  const backup = parseModuWorkBackup(await new File(result.assets[0].uri).text());
  if (!backup) throw new Error('유효한 모두의 근무 백업 파일이 아닙니다.');
  return backup;
}

function serializeBackup(backup: ModuWorkBackup, storageKeys: readonly string[]): [string, string][] {
  const [shiftSettingsKey, personalEventsKey, dateMemosKey, shiftOverridesKey, recentColorsKey, salarySettingsKey, overtimeEntriesKey, monthlyMemosKey, frequentEventsKey] = storageKeys;
  const values: [string, string][] = [
    [monthlyMemosKey, JSON.stringify({ version: MONTHLY_MEMOS_STORAGE_VERSION, memos: backup.monthlyMemos ?? {} })],
    [personalEventsKey, JSON.stringify({ version: PERSONAL_EVENTS_STORAGE_VERSION, events: backup.personalEvents })],
    [dateMemosKey, JSON.stringify({ version: DATE_MEMOS_STORAGE_VERSION, memos: backup.dateMemos })],
    [shiftOverridesKey, JSON.stringify({ version: SHIFT_DATE_OVERRIDES_STORAGE_VERSION, overrides: backup.shiftDateOverrides })],
    [recentColorsKey, JSON.stringify(backup.recentColors)],
    [overtimeEntriesKey, JSON.stringify({ version: OVERTIME_STORAGE_VERSION, entries: backup.overtimeEntries ?? [] })],
    [frequentEventsKey, JSON.stringify({ version: FREQUENT_EVENTS_STORAGE_VERSION, templates: backup.frequentEventTemplates ?? [] })],
  ];
  if (backup.shiftSettings) values.unshift([shiftSettingsKey, JSON.stringify(backup.shiftSettings)]);
  if (backup.salarySettings) values.push([salarySettingsKey, JSON.stringify(backup.salarySettings)]);
  return values;
}

export async function restoreLocalBackup(backup: ModuWorkBackup) {
  const validated = parseModuWorkBackup(JSON.stringify(backup));
  if (!validated) throw new Error('유효한 모두의 근무 백업 파일이 아닙니다.');

  const scopedKeys = await Promise.all(STORAGE_KEYS.map((key) => getCurrentUserScopedStorageKey(key)));
  const snapshot = await AsyncStorage.multiGet(scopedKeys);
  try {
    await AsyncStorage.multiSet(serializeBackup(validated, scopedKeys));
    if (!validated.shiftSettings) await AsyncStorage.removeItem(scopedKeys[0]);
    if (validated.salarySettings === null) await AsyncStorage.removeItem(scopedKeys[5]);
  } catch (error) {
    try {
      const existing = snapshot.filter((pair): pair is [string, string] => pair[1] !== null);
      const missing = snapshot.filter(([, value]) => value === null).map(([key]) => key);
      if (existing.length) await AsyncStorage.multiSet(existing);
      if (missing.length) await AsyncStorage.multiRemove(missing);
    } catch (rollbackError) {
      console.error('Unable to rollback failed data restore.', rollbackError);
    }
    throw error;
  }
}
