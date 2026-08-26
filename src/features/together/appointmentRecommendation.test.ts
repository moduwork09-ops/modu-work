import {
  createAppointmentRecommendations,
  formatRecommendationDuration,
  parseAppointmentPrefill,
  toAppointmentPrefill,
} from './appointmentRecommendation';
import type { TogetherCommonAvailability, TogetherCommonAvailabilityStatus } from './commonAvailabilityPresentation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function day(localDate: string, intervals: Array<[number, number]>, status: TogetherCommonAvailabilityStatus = 'ready'): TogetherCommonAvailability {
  return {
    localDate,
    availabilityStatus: status,
    timezoneName: status === 'ready' ? 'Asia/Seoul' : null,
    intervals: intervals.map(([startMinute, endMinute]) => ({ startMinute, endMinute })),
  };
}

const result = createAppointmentRecommendations([
  day('2026-08-27', [[540, 599], [600, 660], [720, 900]]),
  day('2026-08-28', [[480, 660], [960, 1200]]),
  day('2026-08-29', [[600, 840]]),
], [{ localDate: '2026-08-29', isCommonDayOff: true }]);

assert(result.recommendations.every((item) => item.durationMinutes >= 60), 'under 60 minutes excluded');
assert(createAppointmentRecommendations([day('2026-08-27', [[600, 660]])], []).recommendations.length === 1, 'exactly 60 minutes included');
assert(result.recommendations[0].localDate === '2026-08-29', 'common day off first');
assert(result.recommendations.length === 3, 'top three');
assert(createAppointmentRecommendations([day('2026-08-28', [[480, 660], [960, 1200]])], []).recommendations.length === 2, 'multiple intervals');

const durationRank = createAppointmentRecommendations([
  day('2026-08-27', [[540, 660], [720, 960]]),
], []).recommendations;
assert(durationRank[0].durationMinutes === 240, 'longer interval first');

const dateRank = createAppointmentRecommendations([
  day('2026-08-28', [[540, 660]]),
  day('2026-08-27', [[600, 720]]),
], []).recommendations;
assert(dateRank[0].localDate === '2026-08-27', 'nearer date first');

const startRank = createAppointmentRecommendations([
  day('2026-08-27', [[720, 840], [540, 660]]),
], []).recommendations;
assert(startRank[0].startMinute === 540, 'earlier start first');
assert(createAppointmentRecommendations([day('2026-08-27', [])], []).recommendations.length === 0, 'ready empty');

for (const status of ['sharing_disabled', 'not_synced', 'timezone_mismatch', 'not_enough_members'] as const) {
  const unavailable = createAppointmentRecommendations([day('2026-08-27', [], status)], []);
  assert(unavailable.availabilityStatus === status && unavailable.recommendations.length === 0, `${status} has no recommendations`);
}

let malformedRejected = false;
try {
  createAppointmentRecommendations([day('2026-08-27', [[660, 600]])], []);
} catch {
  malformedRejected = true;
}
assert(malformedRejected, 'malformed interval rejected');
assert(dateRank.map((item) => item.localDate).join(',') === '2026-08-27,2026-08-28', 'local date ordering');
assert(formatRecommendationDuration(60) === '1시간', '60 minute duration');
assert(formatRecommendationDuration(90) === '1시간 30분', '90 minute duration');

const prefill = toAppointmentPrefill({ localDate: '2026-08-29', startMinute: 840, endMinute: 1080, durationMinutes: 240, isCommonDayOff: true });
assert(prefill.localDate === '2026-08-29' && prefill.startTime === '14:00' && prefill.endTime === '18:00', 'recommendation prefill');
assert(parseAppointmentPrefill(prefill.localDate, prefill.startTime, prefill.endTime)?.startTime === '14:00', 'valid prefill parsed');
assert(parseAppointmentPrefill(undefined, undefined, undefined) === null, 'direct creation keeps default');

console.log('appointmentRecommendation fixtures passed');
