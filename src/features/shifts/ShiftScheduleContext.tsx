import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { defaultPattern, mockShiftTypes, type ShiftType } from '../shift-settings/mockData';
import { loadDateMemos, persistDateMemos, type DateMemos } from '../memos/dateMemoStorage';
import { loadPersistedShiftSettings, persistShiftSettings, SHIFT_SETTINGS_STORAGE_VERSION } from './shiftSettingsStorage';

type ShiftScheduleContextValue = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  isHydrated: boolean;
  dateMemos: DateMemos;
  addShiftType: (shiftType: ShiftType) => void;
  saveShiftSchedule: (schedule: Pick<ShiftScheduleContextValue, 'shiftPattern' | 'anchorDate' | 'anchorPatternIndex'>) => Promise<void>;
  saveDateMemo: (date: string, text: string) => Promise<void>;
};

const ShiftScheduleContext = createContext<ShiftScheduleContextValue | null>(null);

export function ShiftScheduleProvider({ children }: PropsWithChildren) {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(mockShiftTypes);
  const [shiftPattern, setShiftPattern] = useState<string[]>(defaultPattern);
  const [anchorDate, setAnchorDate] = useState('2026-08-10');
  const [anchorPatternIndex, setAnchorPatternIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [dateMemos, setDateMemos] = useState<DateMemos>({});

  useEffect(() => {
    let isActive = true;

    const hydrateShiftSettings = async () => {
      const [savedSettings, savedMemos] = await Promise.all([loadPersistedShiftSettings(), loadDateMemos()]);

      if (isActive && savedSettings) {
        setShiftTypes(savedSettings.shiftTypes);
        setShiftPattern(savedSettings.shiftPattern);
        setAnchorDate(savedSettings.anchorDate);
        setAnchorPatternIndex(savedSettings.anchorPatternIndex);
      }

      if (isActive) {
        setDateMemos(savedMemos);
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
    isHydrated,
    dateMemos,
    addShiftType: (shiftType) => setShiftTypes((current) => [
      ...current,
      { ...shiftType, id: `custom-shift-${current.length + 1}` },
    ]),
    saveShiftSchedule: async (schedule) => {
      setShiftPattern(schedule.shiftPattern);
      setAnchorDate(schedule.anchorDate);
      setAnchorPatternIndex(schedule.anchorPatternIndex);

      await persistShiftSettings({
        version: SHIFT_SETTINGS_STORAGE_VERSION,
        shiftTypes,
        shiftPattern: schedule.shiftPattern,
        anchorDate: schedule.anchorDate,
        anchorPatternIndex: schedule.anchorPatternIndex,
      });
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
  }), [anchorDate, anchorPatternIndex, dateMemos, isHydrated, shiftPattern, shiftTypes]);

  return <ShiftScheduleContext.Provider value={value}>{children}</ShiftScheduleContext.Provider>;
}

export function useShiftSchedule() {
  const context = useContext(ShiftScheduleContext);

  if (!context) {
    throw new Error('useShiftSchedule must be used within ShiftScheduleProvider.');
  }

  return context;
}
