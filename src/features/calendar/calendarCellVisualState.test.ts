import { strict as assert } from 'node:assert';
import { CALENDAR_SELECTION_BACKGROUND, getCalendarCellVisualState } from './calendarCellVisualState';

assert.equal(getCalendarCellVisualState('2026-09-06', '2026-09-06', '2026-09-06'), 'selected');
assert.equal(getCalendarCellVisualState('2026-09-06', '2026-09-06', '2026-09-18'), 'today');
assert.equal(getCalendarCellVisualState('2026-09-18', '2026-09-06', '2026-09-18'), 'selected');
assert.equal(getCalendarCellVisualState('2026-09-06', '2026-09-06', '2026-09-06'), 'selected', 'returning to today restores selection');
assert.equal(getCalendarCellVisualState('2026-09-12', '2026-09-12', '2026-09-18'), 'today', 'Saturday follows the same today rule');
assert.equal(getCalendarCellVisualState('2026-09-13', '2026-09-13', '2026-09-13'), 'selected', 'Sunday selection wins over today-only style');
assert.equal(CALENDAR_SELECTION_BACKGROUND, '#F5F9FF');
console.log('calendar cell visual state fixtures passed');
