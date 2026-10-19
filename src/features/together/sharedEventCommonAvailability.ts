import { MIN_GAP_MINUTES } from '../gaps/gapCalculator';
import type { TogetherCommonAvailability } from './commonAvailabilityPresentation';
import type { SharedEvent } from './sharedEventContract';

function zonedDateAndMinute(timestamp: string, timezoneName: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

/** Shared events are space-scoped busy time for Together gaps, not member projections. */
export function excludeSharedEventsFromCommonAvailability(
  spaceId: string,
  days: readonly TogetherCommonAvailability[],
  events: readonly SharedEvent[],
): TogetherCommonAvailability[] {
  if (events.some((event) => event.spaceId !== spaceId)) {
    throw new Error('Shared event belongs to another space');
  }
  return days.map((day) => {
    if (day.availabilityStatus !== 'ready' || !day.timezoneName) return day;
    const busy = events.flatMap((event) => {
      const start = zonedDateAndMinute(event.startsAt, day.timezoneName!);
      const end = zonedDateAndMinute(event.endsAt, day.timezoneName!);
      if (day.localDate < start.date || day.localDate > end.date) return [];
      const startMinute = day.localDate === start.date ? start.minute : 0;
      const endMinute = day.localDate === end.date ? end.minute : 1440;
      return startMinute < endMinute ? [{ startMinute, endMinute }] : [];
    }).sort((left, right) => left.startMinute - right.startMinute);
    const intervals = day.intervals.flatMap((interval) => {
      const available: typeof day.intervals = [];
      let cursor = interval.startMinute;
      for (const block of busy) {
        if (block.endMinute <= cursor || block.startMinute >= interval.endMinute) continue;
        if (block.startMinute > cursor) available.push({ startMinute: cursor, endMinute: block.startMinute });
        cursor = Math.max(cursor, block.endMinute);
        if (cursor >= interval.endMinute) break;
      }
      if (cursor < interval.endMinute) available.push({ startMinute: cursor, endMinute: interval.endMinute });
      return available.filter((part) => part.endMinute - part.startMinute >= MIN_GAP_MINUTES);
    });
    return { ...day, intervals };
  });
}
