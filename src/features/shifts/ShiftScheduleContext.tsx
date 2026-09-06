import { useRef, createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import * as Crypto from 'expo-crypto';

import { defaultPattern, mockShiftTypes, type ShiftType } from '../shift-settings/mockData';
import { loadDateMemosResult, persistDateMemos, type DateMemo, type DateMemos } from '../memos/dateMemoStorage';
import { loadPersonalEventsResult, persistPersonalEvents, type PersonalEvent } from '../events/personalEventStorage';
import { resetAllUserData as resetPersistedUserData } from '../data/resetAllUserData';
import type { OvertimeEntry } from '../overtime/overtime';
import { overtimeEntryStore } from '../overtime/overtimeStorage';
import type { ShiftPreset } from '../shift-presets/shiftPreset';
import { persistShiftPresetApplication } from '../shift-presets/shiftPresetApplication';
import {
  activateDayOffProjectionSync,
  enqueueDayOffProjectionDirtyDate,
  enqueueDayOffProjectionDirtyDates,
  getDayOffProjectionSyncCoverage,
  scheduleClearDayOffProjectionSync,
  scheduleFullDayOffProjectionSync,
  setDayOffProjectionSchedule,
} from '../together/dayOffProjectionSync';
import type { ProjectionHydrationStatus } from '../together/dayOffProjectionSyncCoordinator';
import { getChangedDayOffProjectionDates } from '../together/dayOffProjection';
import {
  activateAvailabilityProjectionSync,
  enqueueAvailabilityProjectionDates,
  getDeviceIanaTimezoneName,
  scheduleClearAvailabilityProjectionSync,
  scheduleFullAvailabilityProjectionSync,
  setAvailabilityProjectionSource,
} from '../together/availabilityProjectionSync';
import { getAvailabilityAffectedEventDates, getAvailabilityAffectedShiftDates, type AvailabilityHydrationStatus } from '../together/availabilityProjectionSyncCoordinator';
import { createEmptyMonthlyWidgetSnapshot, createMonthlyWidgetSnapshot } from '../widget/monthlyWidgetSnapshot';
import { syncMonthlyWidgetSnapshot } from '../widget/widgetBridge';
import { loadPersistedShiftSettingsResult, persistShiftSettings, SHIFT_SETTINGS_STORAGE_VERSION, type ShiftPatternHistoryEntry } from './shiftSettingsStorage';
import { loadShiftDateOverridesResult, persistShiftDateOverrides, type ShiftDateOverrides } from './shiftDateOverrideStorage';
import type { ShiftScheduleInput } from './shiftSchedule';
import { monthlyMemoStore } from '../memos/monthlyMemoStorage';
import type { MonthlyMemos } from '../memos/monthlyMemo';

type ShiftScheduleContextValue = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  patternHistory: ShiftPatternHistoryEntry[];
  shiftDateOverrides: ShiftDateOverrides;
  hasCompletedSetup: boolean;
  isHydrated: boolean;
  projectionHydrationStatus: ProjectionHydrationStatus;
  monthlyMemos: MonthlyMemos;
  monthlyMemosReady: boolean;
  saveMonthlyMemo: (month: string, text: string) => Promise<boolean>;
  dateMemos: DateMemos;
  personalEvents: PersonalEvent[];
  overtimeEntries: OvertimeEntry[];
  reloadPersistedData: () => Promise<void>;
  resetAllUserData: () => Promise<void>;
  addShiftType: (shiftType: Omit<ShiftType, 'id'>) => Promise<boolean>;
  updateShiftType: (shiftType: ShiftType) => Promise<boolean>;
  deleteShiftType: (id: string) => Promise<'success' | 'in-use' | 'last-type' | 'save-failed'>;
  saveShiftSchedule: (schedule: Pick<ShiftScheduleContextValue, 'shiftPattern' | 'anchorDate' | 'anchorPatternIndex'> & { effectiveFrom: string }) => Promise<boolean>;
  applyShiftPreset: (input: { preset: ShiftPreset; effectiveFrom: string }) => Promise<boolean>;
  saveDateMemo: (date: string, memo: DateMemo) => Promise<boolean>;
  deleteDateMemo: (date: string, id: string) => Promise<boolean>;
  saveShiftDateOverride: (date: string, shiftTypeId: string) => Promise<boolean>;
  removeShiftDateOverride: (date: string) => Promise<boolean>;
  savePersonalEvent: (event: PersonalEvent) => Promise<boolean>;
  deletePersonalEvent: (id: string) => Promise<boolean>;
  saveOvertimeEntry: (entry: OvertimeEntry) => Promise<boolean>;
  deleteOvertimeEntry: (id: string) => Promise<boolean>;
};

const ShiftScheduleContext = createContext<ShiftScheduleContextValue | null>(null);

export function ShiftScheduleProvider({ children, ownerUserId }: PropsWithChildren<{ ownerUserId?: string }>) {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(mockShiftTypes);
  const [shiftPattern, setShiftPattern] = useState<string[]>(defaultPattern);
  const [anchorDate, setAnchorDate] = useState('2026-08-10');
  const [anchorPatternIndex, setAnchorPatternIndex] = useState(0);
  const [patternHistory, setPatternHistory] = useState<ShiftPatternHistoryEntry[]>([]);
  const [shiftDateOverrides, setShiftDateOverrides] = useState<ShiftDateOverrides>({});
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [projectionHydrationStatus, setProjectionHydrationStatus] = useState<ProjectionHydrationStatus>('loading');
  const [monthlyMemos, setMonthlyMemos] = useState<MonthlyMemos>({});
  const [monthlyMemosReady, setMonthlyMemosReady] = useState(false);
  const monthlyMemoSaving = useRef(false);
  const [dateMemos, setDateMemos] = useState<DateMemos>({});
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([]);
  const [availabilityHydrationStatus, setAvailabilityHydrationStatus] = useState<AvailabilityHydrationStatus>('loading');
  const [availabilityTimezoneName, setAvailabilityTimezoneName] = useState<string | null>(null);

  const reloadPersistedData = useCallback(async () => {
    setProjectionHydrationStatus('loading');
    setAvailabilityHydrationStatus('loading');
    const [settingsResult, memosResult, eventsResult, overridesResult, overtimeResult, monthlyResult] = await Promise.all([
      loadPersistedShiftSettingsResult(),
      loadDateMemosResult(),
      loadPersonalEventsResult(),
      loadShiftDateOverridesResult(),
      ownerUserId ? overtimeEntryStore.load(ownerUserId) : Promise.resolve({ status: 'ready' as const, entries: [] }),
      ownerUserId ? monthlyMemoStore.load(ownerUserId).then((memos) => ({ memos, ready: true })).catch(() => ({ memos: {} as MonthlyMemos, ready: false })) : Promise.resolve({ memos: {} as MonthlyMemos, ready: false }),
    ]);
    setMonthlyMemos(monthlyResult.memos);
    setMonthlyMemosReady(monthlyResult.ready);
    const savedSettings = settingsResult.status === 'ready' ? settingsResult.value : null;
    const savedOverrides = overridesResult.status === 'ready' ? overridesResult.value : {};
    const savedMemos = memosResult.status === 'ready' ? memosResult.value : {};
    const savedEvents = eventsResult.status === 'ready' ? eventsResult.value : [];

    setShiftTypes(savedSettings?.shiftTypes ?? mockShiftTypes);
    setShiftPattern(savedSettings?.shiftPattern ?? defaultPattern);
    setAnchorDate(savedSettings?.anchorDate ?? '2026-08-10');
    setAnchorPatternIndex(savedSettings?.anchorPatternIndex ?? 0);
    setPatternHistory(savedSettings?.patternHistory ?? []);
    setShiftDateOverrides(savedOverrides);
    setHasCompletedSetup(savedSettings?.isSetupComplete ?? false);
    setDateMemos(savedMemos);
    setPersonalEvents(savedEvents);
    setOvertimeEntries(overtimeResult.status === 'ready' ? overtimeResult.entries : []);
    const hydrationStatus = settingsResult.status === 'ready' && overridesResult.status === 'ready' ? 'ready' : 'error';
    const timezoneName = getDeviceIanaTimezoneName();
    const availabilityStatus = hydrationStatus === 'ready' && memosResult.status === 'ready'
      && eventsResult.status === 'ready' && timezoneName ? 'ready' : 'error';
    setProjectionHydrationStatus(hydrationStatus);
    setAvailabilityHydrationStatus(availabilityStatus);
    setAvailabilityTimezoneName(timezoneName);
    setIsHydrated(true);
    if (ownerUserId) {
      setDayOffProjectionSchedule(ownerUserId, {
        shiftTypes: savedSettings?.shiftTypes ?? mockShiftTypes,
        shiftPattern: savedSettings?.shiftPattern ?? defaultPattern,
        anchorDate: savedSettings?.anchorDate ?? '2026-08-10',
        anchorPatternIndex: savedSettings?.anchorPatternIndex ?? 0,
        patternHistory: savedSettings?.patternHistory ?? [],
        shiftDateOverrides: savedOverrides,
        hasCompletedSetup: savedSettings?.isSetupComplete ?? false,
        hydrationStatus,
      });
      setAvailabilityProjectionSource(ownerUserId, {
        schedule: {
          shiftTypes: savedSettings?.shiftTypes ?? mockShiftTypes,
          shiftPattern: savedSettings?.shiftPattern ?? defaultPattern,
          anchorDate: savedSettings?.anchorDate ?? '2026-08-10',
          anchorPatternIndex: savedSettings?.anchorPatternIndex ?? 0,
          patternHistory: savedSettings?.patternHistory ?? [],
          shiftDateOverrides: savedOverrides,
        },
        personalEvents: savedEvents,
        dateMemos: savedMemos,
        timezoneName,
        hasCompletedSetup: savedSettings?.isSetupComplete ?? false,
        hydrationStatus: availabilityStatus,
      });
    }
  }, [ownerUserId]);

  const publishAvailabilitySource = useCallback((schedule: ShiftScheduleInput, nextMemos = dateMemos, nextEvents = personalEvents, completedSetup = hasCompletedSetup, status = availabilityHydrationStatus) => {
    if (!ownerUserId) return;
    setAvailabilityProjectionSource(ownerUserId, { schedule, dateMemos: nextMemos, personalEvents: nextEvents,
      hasCompletedSetup: completedSetup, hydrationStatus: status, timezoneName: availabilityTimezoneName });
  }, [availabilityHydrationStatus, availabilityTimezoneName, dateMemos, hasCompletedSetup, ownerUserId, personalEvents]);

  const publishProjectionSchedule = useCallback((schedule: ShiftScheduleInput, completedSetup = hasCompletedSetup, status = projectionHydrationStatus) => {
    if (!ownerUserId) return;
    setDayOffProjectionSchedule(ownerUserId, {
      ...schedule,
      hasCompletedSetup: completedSetup,
      hydrationStatus: status,
    });
  }, [hasCompletedSetup, ownerUserId, projectionHydrationStatus]);

  const enqueueProjectionDiff = useCallback((before: ShiftScheduleInput, after: ShiftScheduleInput) => {
    if (!ownerUserId || projectionHydrationStatus !== 'ready') return;
    void (async () => {
      const coverage = await getDayOffProjectionSyncCoverage(ownerUserId);
      if (!coverage) return;
      try {
        const dirtyDates = getChangedDayOffProjectionDates(before, after, coverage.rangeStart, coverage.rangeEnd);
        if (dirtyDates.length > 0) await enqueueDayOffProjectionDirtyDates(ownerUserId, dirtyDates);
      } catch {
        // Local persistence remains authoritative when projection calculation cannot run.
      }
    })();
  }, [ownerUserId, projectionHydrationStatus]);

  useEffect(() => {
    let isActive = true;

    const hydrateShiftSettings = async () => {
      if (isActive) await reloadPersistedData();
    };

    void hydrateShiftSettings();

    return () => {
      isActive = false;
    };
  }, [reloadPersistedData]);

  useEffect(() => {
    if (!ownerUserId) return undefined;
    return activateDayOffProjectionSync(ownerUserId);
  }, [ownerUserId]);

  useEffect(() => {
    if (!ownerUserId) return undefined;
    return activateAvailabilityProjectionSync(ownerUserId);
  }, [ownerUserId]);

  useEffect(() => {
    publishProjectionSchedule({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides });
  }, [anchorDate, anchorPatternIndex, patternHistory, publishProjectionSchedule, shiftDateOverrides, shiftPattern, shiftTypes]);

  useEffect(() => {
    publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides });
  }, [anchorDate, anchorPatternIndex, patternHistory, publishAvailabilitySource, shiftDateOverrides, shiftPattern, shiftTypes]);

  useEffect(() => {
    // Clear a previous owner's native snapshot while this account is hydrating.
    const snapshot = isHydrated && hasCompletedSetup
      ? createMonthlyWidgetSnapshot({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides, dateMemos, personalEvents })
      : createEmptyMonthlyWidgetSnapshot();
    void syncMonthlyWidgetSnapshot(snapshot).catch((error) => {
      console.warn('Unable to sync the Android monthly widget.', error);
    });
  }, [anchorDate, anchorPatternIndex, dateMemos, hasCompletedSetup, isHydrated, ownerUserId, patternHistory, personalEvents, shiftDateOverrides, shiftPattern, shiftTypes]);

  const value = useMemo<ShiftScheduleContextValue>(() => ({
    shiftTypes,
    shiftPattern,
    anchorDate,
    anchorPatternIndex,
    patternHistory,
    shiftDateOverrides,
    hasCompletedSetup,
    isHydrated,
    projectionHydrationStatus,
    monthlyMemos,
    monthlyMemosReady,
    saveMonthlyMemo: async (month, text) => {
      if (!ownerUserId || !monthlyMemosReady || monthlyMemoSaving.current) return false;
      monthlyMemoSaving.current = true;
      try {
        const next = await monthlyMemoStore.save(ownerUserId, month, text);
        setMonthlyMemos(next);
        return true;
      } catch { return false; } finally { monthlyMemoSaving.current = false; }
    },
    dateMemos,
    personalEvents,
    overtimeEntries,
    reloadPersistedData,
    resetAllUserData: async () => {
      if (!ownerUserId) throw new Error('로그인이 필요해요.');
      await resetPersistedUserData(ownerUserId, reloadPersistedData);
      if (ownerUserId) await scheduleClearDayOffProjectionSync(ownerUserId);
      if (ownerUserId) await scheduleClearAvailabilityProjectionSync(ownerUserId);
    },
    addShiftType: async (shiftType) => {
      const nextShiftTypes = [...shiftTypes, { ...shiftType, id: `custom-shift-${Date.now()}` }];
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      publishAvailabilitySource({ shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides });
      if (ownerUserId && hasCompletedSetup) void scheduleFullAvailabilityProjectionSync(ownerUserId);
      return true;
    },
    updateShiftType: async (shiftType) => {
      const previousShiftType = shiftTypes.find((current) => current.id === shiftType.id);
      const beforeSchedule = { shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides };
      const nextShiftTypes = shiftTypes.map((current) => current.id === shiftType.id ? shiftType : current);
      const afterSchedule = { ...beforeSchedule, shiftTypes: nextShiftTypes };
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      publishProjectionSchedule(afterSchedule);
      publishAvailabilitySource(afterSchedule);
      if (ownerUserId && hasCompletedSetup) void scheduleFullAvailabilityProjectionSync(ownerUserId);
      if (hasCompletedSetup && previousShiftType && previousShiftType.kind !== shiftType.kind) {
        enqueueProjectionDiff(beforeSchedule, afterSchedule);
      }
      return true;
    },
    deleteShiftType: async (id) => {
      if (shiftPattern.includes(id) || patternHistory.some((entry) => entry.pattern.includes(id)) || Object.values(shiftDateOverrides).some((entry) => entry.shiftTypeId === id)) return 'in-use';
      if (shiftTypes.length <= 1) return 'last-type';

      const nextShiftTypes = shiftTypes.filter((shiftType) => shiftType.id !== id);
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return 'save-failed';

      setShiftTypes(nextShiftTypes);
      publishAvailabilitySource({ shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides });
      if (ownerUserId && hasCompletedSetup) void scheduleFullAvailabilityProjectionSync(ownerUserId);
      return 'success';
    },
    saveShiftSchedule: async (schedule) => {
      const beforeSchedule = { shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides };
      const nextEntry: ShiftPatternHistoryEntry = {
        id: `shift-pattern-${schedule.effectiveFrom}`,
        effectiveFrom: schedule.effectiveFrom,
        pattern: schedule.shiftPattern,
        anchorDate: schedule.anchorDate,
        anchorPatternIndex: schedule.anchorPatternIndex,
        createdAt: new Date().toISOString(),
      };
      const nextPatternHistory = [
        ...patternHistory.filter((entry) => entry.effectiveFrom !== schedule.effectiveFrom),
        nextEntry,
      ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
      const latestEntry = nextPatternHistory[nextPatternHistory.length - 1];
      const afterSchedule = {
        shiftTypes,
        shiftPattern: latestEntry.pattern,
        anchorDate: latestEntry.anchorDate,
        anchorPatternIndex: latestEntry.anchorPatternIndex,
        patternHistory: nextPatternHistory,
        shiftDateOverrides,
      };
      const saved = await persistShiftSettings({
        version: SHIFT_SETTINGS_STORAGE_VERSION,
        isSetupComplete: true,
        shiftTypes,
        shiftPattern: latestEntry.pattern,
        anchorDate: latestEntry.anchorDate,
        anchorPatternIndex: latestEntry.anchorPatternIndex,
        patternHistory: nextPatternHistory,
      });

      if (!saved) return false;

      setShiftPattern(latestEntry.pattern);
      setAnchorDate(latestEntry.anchorDate);
      setAnchorPatternIndex(latestEntry.anchorPatternIndex);
      setPatternHistory(nextPatternHistory);
      setHasCompletedSetup(true);
      publishProjectionSchedule(afterSchedule, true);
      publishAvailabilitySource(afterSchedule, dateMemos, personalEvents, true);
      if (ownerUserId && hasCompletedSetup) void scheduleFullAvailabilityProjectionSync(ownerUserId);
      if (hasCompletedSetup) {
        enqueueProjectionDiff(beforeSchedule, afterSchedule);
      } else if (ownerUserId) {
        await scheduleFullDayOffProjectionSync(ownerUserId);
      }
      return true;
    },
    applyShiftPreset: async ({ preset, effectiveFrom }) => {
      const beforeSchedule = { shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides };
      const reservedIds = new Set(shiftTypes.map((shiftType) => shiftType.id));
      const createShiftTypeId = () => {
        let id: string;
        do id = `preset-shift-${Crypto.randomUUID()}`; while (reservedIds.has(id));
        reservedIds.add(id);
        return id;
      };

      try {
        const next = await persistShiftPresetApplication({
          current: { version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, ...beforeSchedule },
          preset,
          effectiveFrom,
          createShiftTypeId,
          createdAt: new Date().toISOString(),
          persist: persistShiftSettings,
        });
        if (!next) return false;

        setShiftTypes(next.shiftTypes);
        setShiftPattern(next.shiftPattern);
        setAnchorDate(next.anchorDate);
        setAnchorPatternIndex(next.anchorPatternIndex);
        setPatternHistory(next.patternHistory);
        setHasCompletedSetup(true);
        publishProjectionSchedule(next, true);
        publishAvailabilitySource(next, dateMemos, personalEvents, true);
        if (ownerUserId && hasCompletedSetup) void scheduleFullAvailabilityProjectionSync(ownerUserId);
        if (hasCompletedSetup) enqueueProjectionDiff(beforeSchedule, next);
        else if (ownerUserId) await scheduleFullDayOffProjectionSync(ownerUserId);
        return true;
      } catch {
        return false;
      }
    },
    saveDateMemo: async (date, memo) => {
      try {
        const savedMemo = { ...memo, text: memo.text.trim() };
        const current = dateMemos[date] ?? [];
        const nextMemos = { ...dateMemos, [date]: current.some((item) => item.id === memo.id) ? current.map((item) => item.id === memo.id ? savedMemo : item) : [...current, savedMemo] };
        const saved = await persistDateMemos(nextMemos);
        if (!saved) return false;
        setDateMemos(nextMemos);
        publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides }, nextMemos);
        if (ownerUserId && hasCompletedSetup) void enqueueAvailabilityProjectionDates(ownerUserId, [date]);
        return true;
      } catch (error) { console.warn('Unable to save schedule.', error); return false; }
    },
    deleteDateMemo: async (date, id) => {
      const remaining = (dateMemos[date] ?? []).filter((memo) => memo.id !== id);
      const nextMemos = { ...dateMemos };
      if (remaining.length) nextMemos[date] = remaining; else delete nextMemos[date];
      const saved = await persistDateMemos(nextMemos);
      if (!saved) return false;
      setDateMemos(nextMemos);
      publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides }, nextMemos);
      if (ownerUserId && hasCompletedSetup) void enqueueAvailabilityProjectionDates(ownerUserId, [date]);
      return true;
    },
    saveShiftDateOverride: async (date, shiftTypeId) => {
      if (!shiftTypes.some((shiftType) => shiftType.id === shiftTypeId)) return false;
      const now = new Date().toISOString();
      const next = { ...shiftDateOverrides, [date]: { date, shiftTypeId, createdAt: shiftDateOverrides[date]?.createdAt ?? now, updatedAt: now } };
      const saved = await persistShiftDateOverrides(next);
      if (saved) {
        setShiftDateOverrides(next);
        publishProjectionSchedule({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides: next });
        if (ownerUserId) void enqueueDayOffProjectionDirtyDate(ownerUserId, date);
        publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides: next });
        if (ownerUserId && hasCompletedSetup) void enqueueAvailabilityProjectionDates(ownerUserId, getAvailabilityAffectedShiftDates(date));
      }
      return saved;
    },
    removeShiftDateOverride: async (date) => {
      const next = { ...shiftDateOverrides };
      delete next[date];
      const saved = await persistShiftDateOverrides(next);
      if (saved) {
        setShiftDateOverrides(next);
        publishProjectionSchedule({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides: next });
        if (ownerUserId) void enqueueDayOffProjectionDirtyDate(ownerUserId, date);
        publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides: next });
        if (ownerUserId && hasCompletedSetup) void enqueueAvailabilityProjectionDates(ownerUserId, getAvailabilityAffectedShiftDates(date));
      }
      return saved;
    },
    savePersonalEvent: async (event) => {
      const previous = personalEvents.find((item) => item.id === event.id);
      const next = personalEvents.some((item) => item.id === event.id) ? personalEvents.map((item) => item.id === event.id ? event : item) : [...personalEvents, event];
      const saved = await persistPersonalEvents(next);
      if (saved) {
        setPersonalEvents(next);
        publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides }, dateMemos, next);
        if (ownerUserId && hasCompletedSetup) void enqueueAvailabilityProjectionDates(ownerUserId, getAvailabilityAffectedEventDates(previous?.date, event.date));
      }
      return saved;
    },
    deletePersonalEvent: async (id) => {
      const previous = personalEvents.find((event) => event.id === id);
      const next = personalEvents.filter((event) => event.id !== id);
      const saved = await persistPersonalEvents(next);
      if (saved) {
        setPersonalEvents(next);
        publishAvailabilitySource({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides }, dateMemos, next);
        if (ownerUserId && hasCompletedSetup && previous) void enqueueAvailabilityProjectionDates(ownerUserId, [previous.date]);
      }
      return saved;
    },
    saveOvertimeEntry: async (entry) => {
      if (!ownerUserId) return false;
      const next = overtimeEntries.some((item) => item.id === entry.id)
        ? overtimeEntries.map((item) => item.id === entry.id ? entry : item)
        : [...overtimeEntries, entry];
      try {
        await overtimeEntryStore.save(ownerUserId, next);
        setOvertimeEntries(next);
        return true;
      } catch {
        return false;
      }
    },
    deleteOvertimeEntry: async (id) => {
      if (!ownerUserId) return false;
      const next = overtimeEntries.filter((entry) => entry.id !== id);
      try {
        await overtimeEntryStore.save(ownerUserId, next);
        setOvertimeEntries(next);
        return true;
      } catch {
        return false;
      }
    },
  }), [monthlyMemos, monthlyMemosReady, anchorDate, anchorPatternIndex, dateMemos, enqueueProjectionDiff, hasCompletedSetup, isHydrated, overtimeEntries, ownerUserId, patternHistory, personalEvents, projectionHydrationStatus, publishAvailabilitySource, publishProjectionSchedule, reloadPersistedData, shiftDateOverrides, shiftPattern, shiftTypes]);

  return <ShiftScheduleContext.Provider value={value}>{children}</ShiftScheduleContext.Provider>;
}

export function useShiftSchedule() {
  const context = useContext(ShiftScheduleContext);

  if (!context) {
    throw new Error('useShiftSchedule must be used within ShiftScheduleProvider.');
  }

  return context;
}
