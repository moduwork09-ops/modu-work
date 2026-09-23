import { createCalendarDisplaySettingsStore, DEFAULT_CALENDAR_DISPLAY_SETTINGS as defaults, parseCalendarDisplaySettings } from './calendarDisplaySettings';
import { createCalendarMonthGrid, getCalendarWeekdays, getCalendarEventCategory, formatMonthlyCalendarEventTitle, selectMonthlyCalendarItems, type CalendarItemCategory } from './calendarDisplayPresentation';
import { createMonthlyShiftSchedule } from '../shifts/shiftSchedule';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function run() {
  assert(Object.keys(defaults).length === 7 && defaults.showSharedEvents, 'exactly seven settings; shared default ON');
  for (const raw of [null, 'bad', 'null', '[]', '{"version":2}', '{"version":1,"settings":null}']) {
    assert(JSON.stringify(parseCalendarDisplaySettings(raw)) === JSON.stringify(defaults), 'malformed/missing values fall back');
  }
  for (const showMemos of [true, false]) {
    const parsed = parseCalendarDisplaySettings(JSON.stringify({ version: 1, settings: { showMemos, showPersonalEvents: false } }));
    assert(parsed.showSharedEvents && !parsed.showPersonalEvents && !('showMemos' in parsed), 'obsolete dev field ignored; new shared field defaults ON');
  }
  const partial = parseCalendarDisplaySettings(JSON.stringify({ version: 1, settings: { weekStartsOn: 1, showSharedEvents: false, showOvertime: 'no', showHolidayNames: null } }));
  assert(partial.weekStartsOn === 1 && !partial.showSharedEvents && partial.showOvertime && partial.showHolidayNames, 'field-specific fallbacks');
  const map = new Map<string, string>();
  const storage = { getItem: async (key: string) => map.get(key) ?? null, setItem: async (key: string, value: string) => { map.set(key, value); } };
  const store = createCalendarDisplaySettingsStore(storage);
  await store.save('A', partial);
  assert(!(await store.load('A')).showSharedEvents && (await store.load('B')).showSharedEvents, 'A OFF / B ON isolation');
  const saved = JSON.parse(map.get('modu-work.user.A.calendar-display-settings.v1')!);
  assert(saved.version === 1 && !('showMemos' in saved.settings) && Object.keys(saved.settings).length === 7, 'same scoped key/version; final fields only');
  const remounted = createCalendarDisplaySettingsStore(storage);
  assert(!(await remounted.load('A')).showSharedEvents, 'remount/login retains preference');

  assert(getCalendarEventCategory({ kind: 'shared' }) === 'sharedEvent', 'Together shared kind in local event storage');
  assert(getCalendarEventCategory({ kind: 'personal' }) === 'personalEvent' && getCalendarEventCategory({}) === 'personalEvent', 'explicit and legacy personal events');
  const events = [
    { title: '개인', startTime: '18:00', kind: 'personal' as const },
    { title: '시간 없는 등산', startTime: null, kind: 'personal' as const },
    { title: '함께 등산', startTime: '18:00', kind: 'shared' as const },
  ];
  const sourceSnapshot = JSON.stringify(events);
  for (const event of events) {
    assert(formatMonthlyCalendarEventTitle(event.title, event.startTime, true) === (event.startTime ? event.startTime.slice(0, 2) + ' ' + event.title : event.title), 'ON: compact hour and title; untimed title only');
    assert(formatMonthlyCalendarEventTitle(event.title, event.startTime, false) === event.title, 'OFF: title only for personal and shared');
  }
  const items = [
    { category: 'overtime', id: 'o' },
    { category: 'personalEvent', id: 'timed-calendar-schedule' },
    { category: 'personalEvent', id: 'untimed-calendar-schedule' },
    { category: 'personalEvent', id: 'local-personal' },
    { category: 'sharedEvent', id: 'legacy-together' },
    { category: 'sharedEvent', id: 'server-together' },
  ] satisfies { category: CalendarItemCategory; id: string }[];
  const snapshot = JSON.stringify(items);
  for (const showPersonalEvents of [false, true]) for (const showSharedEvents of [false, true]) for (const showOvertime of [false, true]) {
    const settings = { ...defaults, showPersonalEvents, showSharedEvents, showOvertime };
    const enabled = items.filter(i => i.category === 'personalEvent' ? showPersonalEvents : i.category === 'sharedEvent' ? showSharedEvents : showOvertime);
    const result = selectMonthlyCalendarItems(items, settings);
    assert(JSON.stringify(result.visible) === JSON.stringify(enabled.slice(0, 4)), 'independent toggles preserve original priority');
    assert(result.remainingCount === Math.max(0, enabled.length - 4), 'only visible categories contribute to +N');
  }
  assert(JSON.stringify(items) === snapshot && JSON.stringify(events) === sourceSnapshot, 'detail arrays/timestamps not mutated');

  assert(getCalendarWeekdays(0).join('') === '일월화수목금토' && getCalendarWeekdays(1).join('') === '월화수목금토일', 'week labels');
  const shiftTypes = [{ id: 'D', name: '주간', abbreviation: '주', color: '#ffffff', textColor: '#000000', kind: 'work' as const, startTime: '09:00', endTime: '18:00' }];
  const days = createMonthlyShiftSchedule(2026, 9, { shiftTypes, shiftPattern: ['D'], anchorDate: '2026-09-01', anchorPatternIndex: 0 });
  const dates = days.map(d => d.date).join(',');
  for (const start of [0, 1] as const) for (let mask = 0; mask < 64; mask++) {
    const settings = { ...defaults, weekStartsOn: start, showHolidayNames: !!(mask & 1), showPersonalEvents: !!(mask & 2), showSharedEvents: !!(mask & 4), showOvertime: !!(mask & 8), showEventTime: !!(mask & 16), showMonthlyMemoCard: !!(mask & 32) };
    selectMonthlyCalendarItems(items, settings);
    const grid = createCalendarMonthGrid(2026, 9, days, settings.weekStartsOn);
    assert(grid.length === 42 && grid.filter(d => d !== null).map(d => d.date).join(',') === dates, 'every preference combination retains all September dates');
    assert(grid.findIndex(d => d?.day === 1) === (start === 0 ? 2 : 1), 'Sunday/Monday offset');
    assert(new Set(grid.map((d, i) => d?.date ?? 'blank-' + i)).size === 42, 'unique date and blank keys');
    assert(new Set(grid.filter(d => d !== null).map(d => d.day)).size === 30, '1–30 exactly once');
  }
  console.log('PASS: seven defaults, legacy dev values, account isolation, personal/shared/time toggles, +N, source preservation, 128 grid combinations');
}
void run();
