export async function afterSharedEventCommit<T>(mutation: () => Promise<T>, notify: () => Promise<void>): Promise<T> {
  const result = await mutation();
  try { void notify().catch(() => {}); } catch { /* CRUD is already committed. */ }
  return result;
}
