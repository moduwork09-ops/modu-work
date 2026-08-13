export const DEFAULT_ACTIVITY_START = '07:00';
export const DEFAULT_ACTIVITY_END = '23:00';
export const MIN_GAP_MINUTES = 30;

const MINUTES_IN_DAY = 24 * 60;

export type Gap = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type GapCalculationResult = {
  gaps: Gap[];
  totalGapMinutes: number;
};

export type GapShift = {
  date: string;
  startTime?: string;
  endTime?: string;
  kind: 'work' | 'rest';
};

export type GapPersonalEvent = {
  date: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type GapCalculationInput = {
  date: string;
  shifts: GapShift[];
  personalEvents: GapPersonalEvent[];
  activityStart?: string;
  activityEnd?: string;
  minimumGapMinutes?: number;
};

type MinuteRange = {
  start: number;
  end: number;
};

function timeToMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function getPreviousLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));

  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${String(previous.getUTCDate()).padStart(2, '0')}`;
}

function clampRange(range: MinuteRange, activityStart: number, activityEnd: number): MinuteRange | null {
  const start = Math.max(range.start, activityStart);
  const end = Math.min(range.end, activityEnd);

  return end > start ? { start, end } : null;
}

function mergeRanges(ranges: MinuteRange[]) {
  const sortedRanges = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const mergedRanges: MinuteRange[] = [];

  for (const range of sortedRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];

    if (!previous || range.start > previous.end) {
      mergedRanges.push({ ...range });
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  return mergedRanges;
}

function getShiftBusyRanges(date: string, shifts: GapShift[]) {
  const previousDate = getPreviousLocalDate(date);
  const ranges: MinuteRange[] = [];

  for (const shift of shifts) {
    if (shift.kind !== 'work' || !shift.startTime || !shift.endTime) {
      continue;
    }

    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);

    if (start === null || end === null || start === end) {
      continue;
    }

    const endsNextDay = end < start;

    if (shift.date === date) {
      ranges.push({ start, end: endsNextDay ? MINUTES_IN_DAY : end });
    }

    if (endsNextDay && shift.date === previousDate) {
      ranges.push({ start: 0, end });
    }
  }

  return ranges;
}

function getPersonalEventBusyRanges(date: string, personalEvents: GapPersonalEvent[], activityStart: number, activityEnd: number) {
  const eventsForDate = personalEvents.filter((event) => event.date === date);

  if (eventsForDate.some((event) => event.allDay)) {
    return [{ start: activityStart, end: activityEnd }];
  }

  return eventsForDate.flatMap((event) => {
    if (!event.startTime || !event.endTime) {
      return [];
    }

    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);

    return start === null || end === null || end <= start ? [] : [{ start, end }];
  });
}

export function calculateDailyGaps({
  date,
  shifts,
  personalEvents,
  activityStart = DEFAULT_ACTIVITY_START,
  activityEnd = DEFAULT_ACTIVITY_END,
  minimumGapMinutes = MIN_GAP_MINUTES,
}: GapCalculationInput): GapCalculationResult {
  const activityStartMinutes = timeToMinutes(activityStart);
  const activityEndMinutes = timeToMinutes(activityEnd);

  if (activityStartMinutes === null || activityEndMinutes === null || activityEndMinutes <= activityStartMinutes) {
    return { gaps: [], totalGapMinutes: 0 };
  }

  const busyRanges = [
    ...getShiftBusyRanges(date, shifts),
    ...getPersonalEventBusyRanges(date, personalEvents, activityStartMinutes, activityEndMinutes),
  ]
    .map((range) => clampRange(range, activityStartMinutes, activityEndMinutes))
    .filter((range): range is MinuteRange => range !== null);
  const mergedBusyRanges = mergeRanges(busyRanges);
  const gaps: Gap[] = [];
  let cursor = activityStartMinutes;

  for (const busyRange of mergedBusyRanges) {
    if (busyRange.start - cursor >= minimumGapMinutes) {
      gaps.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(busyRange.start),
        durationMinutes: busyRange.start - cursor,
      });
    }

    cursor = Math.max(cursor, busyRange.end);
  }

  if (activityEndMinutes - cursor >= minimumGapMinutes) {
    gaps.push({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(activityEndMinutes),
      durationMinutes: activityEndMinutes - cursor,
    });
  }

  return {
    gaps,
    totalGapMinutes: gaps.reduce((total, gap) => total + gap.durationMinutes, 0),
  };
}

export function formatGapDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) {
    return `${minutes}분`;
  }

  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
