export function getMemoNotificationDate(date: string, startTime: string, minutesBefore: number, now = Date.now()) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  const triggerDate = new Date(year, month - 1, day, hour, minute - minutesBefore);
  return Number.isFinite(triggerDate.getTime()) && triggerDate.getTime() > now ? triggerDate : null;
}
