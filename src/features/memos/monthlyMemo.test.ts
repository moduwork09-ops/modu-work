import { createMonthlyMemoStore, MONTHLY_MEMO_MAX_LENGTH, parseMonthlyMemos, updateMonthlyMemo } from './monthlyMemo';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function run() {
  const data = new Map<string, string>();
  const store = createMonthlyMemoStore({ getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } });
  await store.save('A', '2026-09', '9월 메모');
  await store.save('A', '2026-10', '10월 메모');
  assert((await store.load('A'))['2026-09'].text === '9월 메모', 'September must persist');
  assert((await store.load('A'))['2026-10'].text === '10월 메모', 'October must be independent');
  assert(Object.keys(await store.load('B')).length === 0, 'B must not see A');
  await store.save('B', '2026-09', 'B의 메모');
  await store.save('A', '2026-09', '수정');
  assert((await store.load('A'))['2026-09'].text === '수정', 'edit must persist');
  assert((await store.load('B'))['2026-09'].text === 'B의 메모', 'edit must remain account scoped');
  await store.save('A', '2026-09', '  ');
  assert(!(await store.load('A'))['2026-09'], 'blank must delete month');
  for (const month of ['2026-00', '2026-13', '2026-9', '2026-09-01', 'invalid']) {
    let failed = false; try { await store.save('A', month, 'x'); } catch { failed = true; }
    assert(failed, 'invalid month must fail: ' + month);
  }
  await store.save('A', '2026-09', 'x'.repeat(MONTHLY_MEMO_MAX_LENGTH));
  let overflow = false; try { await store.save('A', '2026-09', 'x'.repeat(MONTHLY_MEMO_MAX_LENGTH + 1)); } catch { overflow = true; }
  assert(overflow, 'oversized text must fail');
  assert((await store.load('A'))['2026-09'].text.length === MONTHLY_MEMO_MAX_LENGTH, 'failed save must preserve existing text');
  const before = await store.load('A'); const snapshot = JSON.stringify(before);
  updateMonthlyMemo(before, '2026-09', 'new'); assert(JSON.stringify(before) === snapshot, 'update must not mutate source');
  assert(parseMonthlyMemos(JSON.stringify({ version: 1, memos: before })) !== null, 'storage must round trip');
  assert(parseMonthlyMemos('{bad') === null, 'corrupt storage must be rejected');
  assert([...data.keys()].every(key => key.includes('.user.')), 'only scoped keys may be written');
  console.log('Monthly memo domain/storage fixtures passed');
}
void run();
