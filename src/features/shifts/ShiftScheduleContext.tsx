import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { defaultPattern, mockShiftTypes, type ShiftType } from '../shift-settings/mockData';
import { loadDateMemos, persistDateMemos, type DateMemo, type DateMemos } from '../memos/dateMemoStorage';
import { cancelMemoNotification, reconcileMemoNotifications, scheduleMemoNotification } from '../memos/memoNotifications';
import { loadPersonalEvents, persistPersonalEvents, type PersonalEvent } from '../events/personalEventStorage';
import { resetAllUserData as resetPersistedUserData } from '../data/resetAllUserData';
import {
  activateDayOffProjectionSync,
  enqueueDayOffProjectionDirtyDate,
  setDayOffProjectionSchedule,
} from '../together/dayOffProjectionSync';
import type { ProjectionHydrationStatus } from '../together/dayOffProjectionSyncCoordinator';
import { createEmptyMonthlyWidgetSnapshot, createMonthlyWidgetSnapshot } from '../widget/monthlyWidgetSnapshot';
import { syncMonthlyWidgetSnapshot } from '../widget/widgetBridge';
import { loadPersistedShiftSettingsResult, persistShiftSettings, SHIFT_SETTINGS_STORAGE_VERSION, type ShiftPatternHistoryEntry } from './shiftSettingsStorage';
import { loadShiftDateOverridesResult, persistShiftDateOverrides, type ShiftDateOverrides } from './shiftDateOverrideStorage';

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
  dateMemos: DateMemos;
  personalEvents: PersonalEvent[];
  reloadPersistedData: () => Promise<void>;
  resetAllUserData: () => Promise<void>;
  addShiftType: (shiftType: Omit<ShiftType, 'id'>) => Promise<boolean>;
  updateShiftType: (shiftType: ShiftType) => Promise<boolean>;
  deleteShiftType: (id: string) => Promise<'success' | 'in-use' | 'last-type' | 'save-failed'>;
  saveShiftSchedule: (schedule: Pick<ShiftScheduleContextValue, 'shiftPattern' | 'anchorDate' | 'anchorPatternIndex'> & { effectiveFrom: string }) => Promise<boolean>;
  saveDateMemo: (date: string, memo: DateMemo) => Promise<boolean>;
  deleteDateMemo: (date: string, id: string) => Promise<boolean>;
  saveShiftDateOverride: (date: string, shiftTypeId: string) => Promise<boolean>;
  removeShiftDateOverride: (date: string) => Promise<boolean>;
  savePersonalEvent: (event: PersonalEvent) => Promise<boolean>;
  deletePersonalEvent: (id: string) => Promise<boolean>;
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
  const [dateMemos, setDateMemos] = useState<DateMemos>({});
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);

  const reloadPersistedData = useCallback(async () => {
    setProjectionHydrationStatus('loading');
    const [settingsResult, savedMemos, savedEvents, overridesResult] = await Promise.all([loadPersistedShiftSettingsResult(), loadDateMemos(), loadPersonalEvents(), loadShiftDateOverridesResult()]);
    const savedSettings = settingsResult.status === 'ready' ? settingsResult.value : null;
    const savedOverrides = overridesResult.status === 'ready' ? overridesResult.value : {};

    setShiftTypes(savedSettings?.shiftTypes ?? mockShiftTypes);
    setShiftPattern(savedSettings?.shiftPattern ?? defaultPattern);
    setAnchorDate(savedSettings?.anchorDate ?? '2026-08-10');
    setAnchorPatternIndex(savedSettings?.anchorPatternIndex ?? 0);
    setPatternHistory(savedSettings?.patternHistory ?? []);
    setShiftDateOverrides(savedOverrides);
    setHasCompletedSetup(savedSettings?.isSetupComplete ?? false);
    const reconciledMemos = await reconcileMemoNotifications(savedMemos);
    if (JSON.stringify(reconciledMemos) !== JSON.stringify(savedMemos)) await persistDateMemos(reconciledMemos);
    setDateMemos(reconciledMemos);
    setPersonalEvents(savedEvents);
    setProjectionHydrationStatus(settingsResult.status === 'ready' && overridesResult.status === 'ready' ? 'ready' : 'error');
    setIsHydrated(true);
  }, []);

  const publishProjectionSchedule = useCallback((overrides: ShiftDateOverrides, status = projectionHydrationStatus) => {
    if (!ownerUserId) return;
    setDayOffProjectionSchedule(ownerUserId, {
      shiftTypes,
      shiftPattern,
      anchorDate,
      anchorPatternIndex,
      patternHistory,
      shiftDateOverrides: overrides,
      hasCompletedSetup,
      hydrationStatus: status,
    });
  }, [anchorDate, anchorPatternIndex, hasCompletedSetup, ownerUserId, patternHistory, projectionHydrationStatus, shiftPattern, shiftTypes]);

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
    publishProjectionSchedule(shiftDateOverrides);
  }, [publishProjectionSchedule, shiftDateOverrides]);

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot = hasCompletedSetup
      ? createMonthlyWidgetSnapshot({ shiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory, shiftDateOverrides, dateMemos, personalEvents })
      : createEmptyMonthlyWidgetSnapshot();
    void syncMonthlyWidgetSnapshot(snapshot).catch((error) => {
      console.warn('Unable to sync the Android monthly widget.', error);
    });
  }, [anchorDate, anchorPatternIndex, dateMemos, hasCompletedSetup, isHydrated, patternHistory, personalEvents, shiftDateOverrides, shiftPattern, shiftTypes]);

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
    dateMemos,
    personalEvents,
    reloadPersistedData,
    resetAllUserData: async () => {
      await resetPersistedUserData();
      await reloadPersistedData();
    },
    addShiftType: async (shiftType) => {
      const nextShiftTypes = [...shiftTypes, { ...shiftType, id: `custom-shift-${Date.now()}` }];
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      return true;
    },
    updateShiftType: async (shiftType) => {
      const nextShiftTypes = shiftTypes.map((current) => current.id === shiftType.id ? shiftType : current);
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      return true;
    },
    deleteShiftType: async (id) => {
      if (shiftPattern.includes(id) || patternHistory.some((entry) => entry.pattern.includes(id)) || Object.values(shiftDateOverrides).some((entry) => entry.shiftTypeId === id)) return 'in-use';
      if (shiftTypes.length <= 1) return 'last-type';

      const nextShiftTypes = shiftTypes.filter((shiftType) => shiftType.id !== id);
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex, patternHistory });

      if (!saved) return 'save-failed';

      setShiftTypes(nextShiftTypes);
      return 'success';
    },
    saveShiftSchedule: async (schedule) => {
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
      return true;
    },
    saveDateMemo: async (date, memo) => {
      const previous = dateMemos[date]?.find((item) => item.id === memo.id);
      try {
        const notificationId = await scheduleMemoNotification(date, { ...memo, notificationId: previous?.notificationId ?? memo.notificationId });
        const savedMemo = { ...memo, text: memo.text.trim(), notificationId };
        const current = dateMemos[date] ?? [];
        const nextMemos = { ...dateMemos, [date]: current.some((item) => item.id === memo.id) ? current.map((item) => item.id === memo.id ? savedMemo : item) : [...current, savedMemo] };
        const saved = await persistDateMemos(nextMemos);
        if (!saved) { await cancelMemoNotification(notificationId); return false; }
        if (previous?.notificationId && previous.notificationId !== notificationId) await cancelMemoNotification(previous.notificationId);
        setDateMemos(nextMemos);
        return true;
      } catch (error) { console.warn('Unable to save schedule.', error); return false; }
    },
    deleteDateMemo: async (date, id) => {
      const existing = dateMemos[date]?.find((memo) => memo.id === id);
      const remaining = (dateMemos[date] ?? []).filter((memo) => memo.id !== id);
      const nextMemos = { ...dateMemos };
      if (remaining.length) nextMemos[date] = remaining; else delete nextMemos[date];
      const saved = await persistDateMemos(nextMemos);
      if (!saved) return false;
      await cancelMemoNotification(existing?.notificationId ?? null);
      setDateMemos(nextMemos);
      return true;
    },
    saveShiftDateOverride: async (date, shiftTypeId) => {
      if (!shiftTypes.some((shiftType) => shiftType.id === shiftTypeId)) return false;
      const now = new Date().toISOString();
      const next = { ...shiftDateOverrides, [date]: { date, shiftTypeId, createdAt: shiftDateOverrides[date]?.createdAt ?? now, updatedAt: now } };
      const saved = await persistShiftDateOverrides(next);
      if (saved) {
        setShiftDateOverrides(next);
        publishProjectionSchedule(next);
        if (ownerUserId) void enqueueDayOffProjectionDirtyDate(ownerUserId, date);
      }
      return saved;
    },
    removeShiftDateOverride: async (date) => {
      const next = { ...shiftDateOverrides };
      delete next[date];
      const saved = await persistShiftDateOverrides(next);
      if (saved) {
        setShiftDateOverrides(next);
        publishProjectionSchedule(next);
        if (ownerUserId) void enqueueDayOffProjectionDirtyDate(ownerUserId, date);
      }
      return saved;
    },
    savePersonalEvent: async (event) => {
      const next = personalEvents.some((item) => item.id === event.id) ? personalEvents.map((item) => item.id === event.id ? event : item) : [...personalEvents, event];
      const saved = await persistPersonalEvents(next);
      if (saved) setPersonalEvents(next);
      return saved;
    },
    deletePersonalEvent: async (id) => {
      const next = personalEvents.filter((event) => event.id !== id);
      const saved = await persistPersonalEvents(next);
      if (saved) setPersonalEvents(next);
      return saved;
    },
  }), [anchorDate, anchorPatternIndex, dateMemos, hasCompletedSetup, isHydrated, ownerUserId, patternHistory, personalEvents, projectionHydrationStatus, publishProjectionSchedule, reloadPersistedData, shiftDateOverrides, shiftPattern, shiftTypes]);

  return <ShiftScheduleContext.Provider value={value}>{children}</ShiftScheduleContext.Provider>;
}

export function useShiftSchedule() {
  const context = useContext(ShiftScheduleContext);

  if (!context) {
    throw new Error('useShiftSchedule must be used within ShiftScheduleProvider.');
  }

  return context;
}
