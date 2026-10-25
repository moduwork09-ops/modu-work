import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import {
  addBriefingDays,
  getBriefingDay,
  type MonthSummary,
  type WeeklyBriefing,
} from './lifeBriefing';

export const shortBriefingDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function getBriefingHero(month: MonthSummary, previous: MonthSummary) {
  const monthLabel = Number(month.month.slice(5)) + '월';
  if (month.unknownDays) return {
    title: monthLabel + '의 근무와 쉼을 살펴봐요',
    detail: '미확인 ' + month.unknownDays + '일은 집계에서 제외했어요.',
  };
  if (!previous.unknownDays && month.nightShifts < previous.nightShifts) return {
    title: monthLabel + '은 야간·당직이 줄었어요',
    detail: '지난달보다 ' + (previous.nightShifts - month.nightShifts) + '회 적고, 휴무는 ' + month.restDays + '일이에요.',
  };
  if (!previous.unknownDays && month.restDays > previous.restDays) return {
    title: monthLabel + '은 쉬는 날이 늘었어요',
    detail: '지난달보다 휴무가 ' + (month.restDays - previous.restDays) + '일 많아요.',
  };
  if (Math.abs(month.workDays - month.restDays) <= 3) return {
    title: monthLabel + '은 균형이 잘 맞는 달이에요',
    detail: '근무 ' + month.workDays + '일 · 휴무 ' + month.restDays + '일',
  };
  return {
    title: monthLabel + '의 근무와 쉼을 한눈에',
    detail: '근무 ' + month.workDays + '일 · 휴무 ' + month.restDays + '일 · 야간·당직 ' + month.nightShifts + '회',
  };
}
export function getBriefingTypeSlices(month: MonthSummary) {
  const top = month.shiftTypes.slice(0, 3);
  const otherCount = month.shiftTypes.slice(3).reduce((sum, item) => sum + item.count, 0);
  return otherCount ? [...top, { id: 'other', name: '기타', color: '#AEB7BF', count: otherCount }] : top;
}

export function getBriefingRecommendationCopy(week: WeeklyBriefing, schedule: ShiftScheduleInput) {
  const rest = week.rest ? (() => {
    const date = week.rest.date;
    const previous = getBriefingDay(addBriefingDays(date, -1), schedule);
    const afterThreeWorkDays = [1, 2, 3].every(offset => getBriefingDay(addBriefingDays(date, -offset), schedule).state === 'work');
    const reason = previous.overnight ? '야간·당직 다음 휴무'
      : afterThreeWorkDays ? '연속 근무 후 첫 휴무'
        : '다음 근무까지 휴식 여유';
    return { date, reason };
  })() : null;
  return { rest };
}

export function getBriefingComments(month: MonthSummary) {
  return [
    { id: 'pattern', title: '근무 패턴', text: month.longestWork ? `가장 긴 연속 근무는 ${month.longestWork.days}일이에요.` : '집계된 연속 근무가 없어요.' },
    { id: 'rest', title: '휴식 살펴보기', text: month.nightShifts ? `야간·당직 ${month.nightShifts}회를 확인해요.` : '이번 달 집계된 야간·당직이 없어요.' },
  ];
}
