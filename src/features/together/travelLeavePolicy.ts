/** Planning assumption: one work shift, including overnight, costs one leave day. */
export const MAX_SIMULATED_LEAVE_DAYS = 5;

export function parseSimulatedLeaveDays(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= 0 && value <= MAX_SIMULATED_LEAVE_DAYS ? value : null;
}
