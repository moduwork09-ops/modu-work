import { calculateDailyGaps } from './gapCalculator';

type ExpectedGap = [string, string, number];

function verify(name: string, result: ReturnType<typeof calculateDailyGaps>, expected: ExpectedGap[], total: number) {
  const actual = result.gaps.map((gap) => [gap.startTime, gap.endTime, gap.durationMinutes]);

  if (JSON.stringify(actual) !== JSON.stringify(expected) || result.totalGapMinutes !== total) {
    throw new Error(`${name} failed: ${JSON.stringify({ actual, total: result.totalGapMinutes })}`);
  }
}

const date = '2026-08-13';
const input = (overrides: Partial<Parameters<typeof calculateDailyGaps>[0]>) => ({ date, shifts: [], personalEvents: [], ...overrides });

verify('A', calculateDailyGaps(input({})), [['07:00', '23:00', 960]], 960);
verify('B', calculateDailyGaps(input({ shifts: [{ date, kind: 'work', startTime: '09:00', endTime: '18:00' }] })), [['07:00', '09:00', 120], ['18:00', '23:00', 300]], 420);
verify('C', calculateDailyGaps(input({ shifts: [{ date, kind: 'work', startTime: '19:00', endTime: '09:00' }], personalEvents: [{ date, allDay: false, startTime: '11:00', endTime: '12:00' }, { date, allDay: false, startTime: '14:00', endTime: '15:00' }] })), [['07:00', '11:00', 240], ['12:00', '14:00', 120], ['15:00', '19:00', 240]], 600);
verify('D', calculateDailyGaps(input({ shifts: [{ date: '2026-08-12', kind: 'work', startTime: '19:00', endTime: '09:00' }] })), [['09:00', '23:00', 840]], 840);
verify('E', calculateDailyGaps(input({ personalEvents: [{ date, allDay: false, startTime: '11:00', endTime: '13:00' }, { date, allDay: false, startTime: '12:00', endTime: '14:00' }] })), [['07:00', '11:00', 240], ['14:00', '23:00', 540]], 780);
verify('F', calculateDailyGaps(input({ personalEvents: [{ date, allDay: false, startTime: '11:00', endTime: '12:00' }, { date, allDay: false, startTime: '12:20', endTime: '23:00' }] })), [['07:00', '11:00', 240]], 240);
verify('G', calculateDailyGaps(input({ personalEvents: [{ date, allDay: false, startTime: '11:00', endTime: '12:00' }, { date, allDay: false, startTime: '12:30', endTime: '23:00' }] })), [['07:00', '11:00', 240], ['12:00', '12:30', 30]], 270);
verify('H', calculateDailyGaps(input({ personalEvents: [{ date, allDay: true, startTime: null, endTime: null }] })), [], 0);
verify('I', calculateDailyGaps(input({ shifts: [{ date, kind: 'work', startTime: '09:00', endTime: '18:00' }], personalEvents: [{ date, allDay: false, startTime: '17:00', endTime: '19:00' }] })), [['07:00', '09:00', 120], ['19:00', '23:00', 240]], 360);
verify('J', calculateDailyGaps(input({ personalEvents: [{ date, allDay: false, startTime: '06:00', endTime: '08:00' }] })), [['08:00', '23:00', 900]], 900);

verify('rest shifts do not block gaps', calculateDailyGaps(input({ shifts: [{ date, kind: 'rest', startTime: '09:00', endTime: '18:00' }] })), [['07:00', '23:00', 960]], 960);
verify('consecutive overnight shifts leave the daytime gap', calculateDailyGaps(input({ shifts: [{ date: '2026-08-12', kind: 'work', startTime: '19:00', endTime: '09:00' }, { date, kind: 'work', startTime: '19:00', endTime: '09:00' }] })), [['09:00', '19:00', 600]], 600);
verify('all-day events override timed gaps', calculateDailyGaps(input({ personalEvents: [{ date, allDay: false, startTime: '09:00', endTime: '10:00' }, { date, allDay: true, startTime: null, endTime: null }] })), [], 0);
verify('touching work and personal ranges are merged', calculateDailyGaps(input({ shifts: [{ date, kind: 'work', startTime: '09:00', endTime: '12:00' }], personalEvents: [{ date, allDay: false, startTime: '12:00', endTime: '15:00' }] })), [['07:00', '09:00', 120], ['15:00', '23:00', 480]], 600);
verify('invalid activity start returns no gaps', calculateDailyGaps(input({ activityStart: '25:00' })), [], 0);
verify('invalid activity end returns no gaps', calculateDailyGaps(input({ activityEnd: 'not-a-time' })), [], 0);
verify('activity end before start returns no gaps', calculateDailyGaps(input({ activityStart: '20:00', activityEnd: '08:00' })), [], 0);
verify('equal activity boundaries return no gaps', calculateDailyGaps(input({ activityStart: '09:00', activityEnd: '09:00' })), [], 0);
verify('gap exactly at the minimum is included', calculateDailyGaps(input({ activityStart: '09:00', activityEnd: '10:00', minimumGapMinutes: 30, personalEvents: [{ date, allDay: false, startTime: '09:30', endTime: '10:00' }] })), [['09:00', '09:30', 30]], 30);
verify('gap below the minimum is excluded', calculateDailyGaps(input({ activityStart: '09:00', activityEnd: '10:00', minimumGapMinutes: 31, personalEvents: [{ date, allDay: false, startTime: '09:30', endTime: '10:00' }] })), [], 0);
verify('custom activity range is respected', calculateDailyGaps(input({ activityStart: '09:00', activityEnd: '19:00', shifts: [{ date, kind: 'work', startTime: '12:00', endTime: '13:00' }] })), [['09:00', '12:00', 180], ['13:00', '19:00', 360]], 540);
verify('invalid and incomplete records are ignored', calculateDailyGaps(input({ shifts: [{ date, kind: 'work', startTime: 'bad', endTime: '10:00' }, { date, kind: 'work', startTime: '11:00' }], personalEvents: [{ date, allDay: false, startTime: '14:00', endTime: null }, { date, allDay: false, startTime: '15:00', endTime: '14:00' }] })), [['07:00', '23:00', 960]], 960);

verify('full-day rest projection', calculateDailyGaps(input({ activityStart: '00:00', activityEnd: '24:00' })), [['00:00', '24:00', 1440]], 1440);
verify('full-day previous overnight spill', calculateDailyGaps(input({ activityStart: '00:00', activityEnd: '24:00', shifts: [{ date: '2026-08-12', kind: 'work', startTime: '19:00', endTime: '09:00' }] })), [['09:00', '24:00', 900]], 900);
verify('full-day personal event blocks travel projection', calculateDailyGaps(input({ activityStart: '00:00', activityEnd: '24:00', personalEvents: [{ date, allDay: true, startTime: null, endTime: null }] })), [], 0);
