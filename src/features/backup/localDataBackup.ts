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

export const MODU_WORK_BACKUP_VERSION = 1 as const;

export type ModuWorkBackup = {
  backupVersion: typeof MODU_WORK_BACKUP_VERSION;
  appDataVersion: number;
  createdAt: string;
  shiftSettings: PersistedShiftSettings | null;
  personalEvents: PersonalEvent[];
  dateMemos: DateMemos;
  shiftDateOverrides: ShiftDateOverrides;
  recentColors: string[];
};

const STORAGE_KEYS = [SHIFT_SETTINGS_STORAGE_KEY, PERSONAL_EVENTS_STORAGE_KEY, DATE_MEMOS_STORAGE_KEY, SHIFT_DATE_OVERRIDES_STORAGE_KEY, RECENT_COLORS_STORAGE_KEY] as const;
const HEX_COLOR = /^#[0-9A-F]{6}$/;
const MAX_RECENT_COLORS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredData(values: readonly (string | null)[]) {
  const [shiftSettingsValue, personalEventsValue, dateMemosValue, shiftOverridesValue, recentColorsValue] = values;
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

  return {
    shiftSettings,
    personalEvents: personalEvents ?? [],
    dateMemos: dateMemos ?? {},
    shiftDateOverrides: shiftDateOverrides ?? {},
    recentColors,
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
    const recentColors = parsed.recentColors === undefined ? [] : parsed.recentColors;

    if ((parsed.shiftSettings !== null && !shiftSettings)
      || !personalEvents
      || !dateMemos
      || !shiftDateOverrides
      || !Array.isArray(recentColors)
      || recentColors.length > MAX_RECENT_COLORS
      || !recentColors.every((color) => typeof color === 'string' && HEX_COLOR.test(color))) return null;
    if (shiftSettings && !Object.values(shiftDateOverrides).every((override) => shiftSettings.shiftTypes.some((shiftType) => shiftType.id === override.shiftTypeId))) return null;

    return {
      backupVersion: MODU_WORK_BACKUP_VERSION,
      appDataVersion: SHIFT_SETTINGS_STORAGE_VERSION,
      createdAt: parsed.createdAt,
      shiftSettings,
      personalEvents,
      dateMemos,
      shiftDateOverrides,
      recentColors,
    };
  } catch {
    return null;
  }
}

export async function createAndShareLocalBackup() {
  const storedPairs = await AsyncStorage.multiGet([...STORAGE_KEYS]);
  const data = parseStoredData(storedPairs.map(([, value]) => value));
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

function serializeBackup(backup: ModuWorkBackup): [string, string][] {
  const values: [string, string][] = [
    [PERSONAL_EVENTS_STORAGE_KEY, JSON.stringify({ version: PERSONAL_EVENTS_STORAGE_VERSION, events: backup.personalEvents })],
    [DATE_MEMOS_STORAGE_KEY, JSON.stringify({ version: DATE_MEMOS_STORAGE_VERSION, memos: backup.dateMemos })],
    [SHIFT_DATE_OVERRIDES_STORAGE_KEY, JSON.stringify({ version: SHIFT_DATE_OVERRIDES_STORAGE_VERSION, overrides: backup.shiftDateOverrides })],
    [RECENT_COLORS_STORAGE_KEY, JSON.stringify(backup.recentColors)],
  ];
  if (backup.shiftSettings) values.unshift([SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(backup.shiftSettings)]);
  return values;
}

export async function restoreLocalBackup(backup: ModuWorkBackup) {
  const validated = parseModuWorkBackup(JSON.stringify(backup));
  if (!validated) throw new Error('유효한 모두의 근무 백업 파일이 아닙니다.');

  const snapshot = await AsyncStorage.multiGet([...STORAGE_KEYS]);
  try {
    await AsyncStorage.multiSet(serializeBackup(validated));
    if (!validated.shiftSettings) await AsyncStorage.removeItem(SHIFT_SETTINGS_STORAGE_KEY);
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
