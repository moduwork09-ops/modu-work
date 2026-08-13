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
