import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';

export const MONTHLY_MEMOS_STORAGE_KEY = 'modu-work.monthly-memos.v1';
export const MONTHLY_MEMOS_STORAGE_VERSION = 1;
export const MONTHLY_MEMO_MAX_LENGTH = 2000;
export type MonthlyMemo = { month: string; text: string; updatedAt: string };
export type MonthlyMemos = Record<string, MonthlyMemo>;
export const isValidMemoMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

export function updateMonthlyMemo(memos: MonthlyMemos, month: string, text: string, updatedAt = new Date().toISOString()): MonthlyMemos {
  if (!isValidMemoMonth(month) || text.length > MONTHLY_MEMO_MAX_LENGTH || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid monthly memo');
  const next = { ...memos };
  if (text.trim()) next[month] = { month, text: text.trim(), updatedAt };
  else delete next[month];
  return next;
}

export function parseMonthlyMemos(raw: string): MonthlyMemos | null {
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== MONTHLY_MEMOS_STORAGE_VERSION || !data.memos || typeof data.memos !== 'object' || Array.isArray(data.memos)) return null;
    const result: MonthlyMemos = {};
    for (const [month, value] of Object.entries(data.memos)) {
      const memo = value as MonthlyMemo | null;
      if (!isValidMemoMonth(month) || !memo || memo.month !== month || typeof memo.text !== 'string' || !memo.text.trim() || memo.text.length > MONTHLY_MEMO_MAX_LENGTH || typeof memo.updatedAt !== 'string' || !Number.isFinite(Date.parse(memo.updatedAt))) return null;
      result[month] = { month, text: memo.text, updatedAt: memo.updatedAt };
    }
    return result;
  } catch { return null; }
}

export function createMonthlyMemoStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }) {
  const keyFor = (userId: string) => { if (!userId) throw new Error('Monthly memo owner required'); return getUserScopedStorageKey(userId, MONTHLY_MEMOS_STORAGE_KEY); };
  const load = async (userId: string): Promise<MonthlyMemos> => {
    const raw = await storage.getItem(keyFor(userId));
    if (raw === null) return {};
    const memos = parseMonthlyMemos(raw);
    if (!memos) throw new Error('Invalid stored monthly memos');
    return memos;
  };
  return {
    load,
    async save(userId: string, month: string, text: string) {
      const next = updateMonthlyMemo(await load(userId), month, text);
      await storage.setItem(keyFor(userId), JSON.stringify({ version: MONTHLY_MEMOS_STORAGE_VERSION, memos: next }));
      return next;
    },
  };
}
