import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { defaultPattern, mockShiftTypes, type ShiftType } from '../shift-settings/mockData';

type ShiftScheduleContextValue = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  addShiftType: (shiftType: ShiftType) => void;
  saveShiftSchedule: (schedule: Pick<ShiftScheduleContextValue, 'shiftPattern' | 'anchorDate' | 'anchorPatternIndex'>) => void;
};

const ShiftScheduleContext = createContext<ShiftScheduleContextValue | null>(null);

export function ShiftScheduleProvider({ children }: PropsWithChildren) {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(mockShiftTypes);
  const [shiftPattern, setShiftPattern] = useState<string[]>(defaultPattern);
  const [anchorDate, setAnchorDate] = useState('2026-08-10');
  const [anchorPatternIndex, setAnchorPatternIndex] = useState(0);

  const value = useMemo<ShiftScheduleContextValue>(() => ({
    shiftTypes,
    shiftPattern,
    anchorDate,
    anchorPatternIndex,
    addShiftType: (shiftType) => setShiftTypes((current) => [
      ...current,
      { ...shiftType, id: `custom-shift-${current.length + 1}` },
    ]),
    saveShiftSchedule: (schedule) => {
      setShiftPattern(schedule.shiftPattern);
      setAnchorDate(schedule.anchorDate);
      setAnchorPatternIndex(schedule.anchorPatternIndex);
    },
  }), [anchorDate, anchorPatternIndex, shiftPattern, shiftTypes]);

  return <ShiftScheduleContext.Provider value={value}>{children}</ShiftScheduleContext.Provider>;
}

export function useShiftSchedule() {
  const context = useContext(ShiftScheduleContext);

  if (!context) {
    throw new Error('useShiftSchedule must be used within ShiftScheduleProvider.');
  }

  return context;
}
