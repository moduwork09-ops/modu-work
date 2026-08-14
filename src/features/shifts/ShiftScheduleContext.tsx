import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { defaultPattern, mockShiftTypes, type ShiftType } from '../shift-settings/mockData';
import { loadDateMemos, persistDateMemos, type DateMemos } from '../memos/dateMemoStorage';
import { loadPersonalEvents, persistPersonalEvents, type PersonalEvent } from '../events/personalEventStorage';
import { loadPersistedShiftSettings, persistShiftSettings, SHIFT_SETTINGS_STORAGE_VERSION } from './shiftSettingsStorage';

type ShiftScheduleContextValue = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  hasCompletedSetup: boolean;
  isHydrated: boolean;
  dateMemos: DateMemos;
  personalEvents: PersonalEvent[];
  addShiftType: (shiftType: Omit<ShiftType, 'id'>) => Promise<boolean>;
  updateShiftType: (shiftType: ShiftType) => Promise<boolean>;
  deleteShiftType: (id: string) => Promise<'success' | 'in-use' | 'last-type' | 'save-failed'>;
  saveShiftSchedule: (schedule: Pick<ShiftScheduleContextValue, 'shiftPattern' | 'anchorDate' | 'anchorPatternIndex'>) => Promise<boolean>;
  saveDateMemo: (date: string, text: string) => Promise<void>;
  savePersonalEvent: (event: PersonalEvent) => Promise<void>;
  deletePersonalEvent: (id: string) => Promise<void>;
};

const ShiftScheduleContext = createContext<ShiftScheduleContextValue | null>(null);

export function ShiftScheduleProvider({ children }: PropsWithChildren) {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(mockShiftTypes);
  const [shiftPattern, setShiftPattern] = useState<string[]>(defaultPattern);
  const [anchorDate, setAnchorDate] = useState('2026-08-10');
  const [anchorPatternIndex, setAnchorPatternIndex] = useState(0);
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [dateMemos, setDateMemos] = useState<DateMemos>({});
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);

  useEffect(() => {
    let isActive = true;

    const hydrateShiftSettings = async () => {
      const [savedSettings, savedMemos, savedEvents] = await Promise.all([loadPersistedShiftSettings(), loadDateMemos(), loadPersonalEvents()]);

      if (isActive && savedSettings) {
        setShiftTypes(savedSettings.shiftTypes);
        setShiftPattern(savedSettings.shiftPattern);
        setAnchorDate(savedSettings.anchorDate);
        setAnchorPatternIndex(savedSettings.anchorPatternIndex);
        setHasCompletedSetup(savedSettings.isSetupComplete);
      }

      if (isActive) {
        setDateMemos(savedMemos);
        setPersonalEvents(savedEvents);
      }

      if (isActive) {
        setIsHydrated(true);
      }
    };

    void hydrateShiftSettings();

    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo<ShiftScheduleContextValue>(() => ({
    shiftTypes,
    shiftPattern,
    anchorDate,
    anchorPatternIndex,
    hasCompletedSetup,
    isHydrated,
    dateMemos,
    personalEvents,
    addShiftType: async (shiftType) => {
      const nextShiftTypes = [...shiftTypes, { ...shiftType, id: `custom-shift-${Date.now()}` }];
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      return true;
    },
    updateShiftType: async (shiftType) => {
      const nextShiftTypes = shiftTypes.map((current) => current.id === shiftType.id ? shiftType : current);
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex });

      if (!saved) return false;

      setShiftTypes(nextShiftTypes);
      return true;
    },
    deleteShiftType: async (id) => {
      if (shiftPattern.includes(id)) return 'in-use';
      if (shiftTypes.length <= 1) return 'last-type';

      const nextShiftTypes = shiftTypes.filter((shiftType) => shiftType.id !== id);
      const saved = await persistShiftSettings({ version: SHIFT_SETTINGS_STORAGE_VERSION, isSetupComplete: hasCompletedSetup, shiftTypes: nextShiftTypes, shiftPattern, anchorDate, anchorPatternIndex });

      if (!saved) return 'save-failed';

      setShiftTypes(nextShiftTypes);
      return 'success';
    },
    saveShiftSchedule: async (schedule) => {
      const saved = await persistShiftSettings({
        version: SHIFT_SETTINGS_STORAGE_VERSION,
        isSetupComplete: true,
        shiftTypes,
        shiftPattern: schedule.shiftPattern,
        anchorDate: schedule.anchorDate,
        anchorPatternIndex: schedule.anchorPatternIndex,
      });

      if (!saved) return false;

      setShiftPattern(schedule.shiftPattern);
      setAnchorDate(schedule.anchorDate);
      setAnchorPatternIndex(schedule.anchorPatternIndex);
      setHasCompletedSetup(true);
      return true;
    },
    saveDateMemo: async (date, text) => {
      const trimmedText = text.trim();
      const nextMemos = { ...dateMemos };

      if (trimmedText) {
        nextMemos[date] = trimmedText;
      } else {
        delete nextMemos[date];
      }

      setDateMemos(nextMemos);
      await persistDateMemos(nextMemos);
    },
    savePersonalEvent: async (event) => { const next = personalEvents.some((item) => item.id === event.id) ? personalEvents.map((item) => item.id === event.id ? event : item) : [...personalEvents, event]; setPersonalEvents(next); await persistPersonalEvents(next); },
    deletePersonalEvent: async (id) => { const next = personalEvents.filter((event) => event.id !== id); setPersonalEvents(next); await persistPersonalEvents(next); },
  }), [anchorDate, anchorPatternIndex, dateMemos, hasCompletedSetup, isHydrated, personalEvents, shiftPattern, shiftTypes]);

  return <ShiftScheduleContext.Provider value={value}>{children}</ShiftScheduleContext.Provider>;
}

export function useShiftSchedule() {
  const context = useContext(ShiftScheduleContext);

  if (!context) {
    throw new Error('useShiftSchedule must be used within ShiftScheduleProvider.');
  }

  return context;
}
