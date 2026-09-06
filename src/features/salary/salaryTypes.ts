import { isValidSalaryShiftLinks } from './salaryShiftIdentity';
export const SALARY_SETTINGS_VERSION = 1 as const;
export type ShiftAllowance = { mode: 'per_shift'; amount: number };
export type AdditionalAllowance = { id: string; name: string; amount: number; applyMode: 'monthly' | 'one_time'; applicableMonth?: string };
export type SalarySettings = { version: typeof SALARY_SETTINGS_VERSION; isConfigured: boolean; baseSalary: number; shiftAllowanceByShiftTypeId: Record<string, ShiftAllowance>; additionalAllowances: AdditionalAllowance[]; salaryVisible: boolean; shiftTypeLinks?: Record<string, string> };
export const EMPTY_SALARY_SETTINGS: SalarySettings = { version: SALARY_SETTINGS_VERSION, isConfigured: false, baseSalary: 0, shiftAllowanceByShiftTypeId: {}, additionalAllowances: [], salaryVisible: true };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function isAmount(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
export function parseSalarySettings(value: string): SalarySettings | null {
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const item = data as Record<string, unknown>;
    if (item.version !== SALARY_SETTINGS_VERSION || typeof item.isConfigured !== 'boolean' || !isAmount(item.baseSalary) || typeof item.salaryVisible !== 'boolean' || !item.shiftAllowanceByShiftTypeId || typeof item.shiftAllowanceByShiftTypeId !== 'object' || Array.isArray(item.shiftAllowanceByShiftTypeId) || !Array.isArray(item.additionalAllowances)) return null;
    if (!Object.entries(item.shiftAllowanceByShiftTypeId as Record<string, unknown>).every(([id, entry]) => id.length > 0 && entry && typeof entry === 'object' && (entry as Record<string, unknown>).mode === 'per_shift' && isAmount((entry as Record<string, unknown>).amount))) return null;
    if (!item.additionalAllowances.every((entry) => { if (!entry || typeof entry !== 'object') return false; const a = entry as Record<string, unknown>; return typeof a.id === 'string' && a.id.length > 0 && typeof a.name === 'string' && a.name.trim().length > 0 && isAmount(a.amount) && (a.applyMode === 'monthly' || (a.applyMode === 'one_time' && typeof a.applicableMonth === 'string' && MONTH.test(a.applicableMonth))); })) return null;
    if (item.shiftTypeLinks !== undefined && !isValidSalaryShiftLinks(item.shiftTypeLinks)) return null;
    return data as SalarySettings;
  } catch { return null; }
}
