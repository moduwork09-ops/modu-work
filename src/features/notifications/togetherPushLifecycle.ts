export type TogetherPushLifecycleDependencies = {
  hasPermission(): Promise<boolean>;
  getToken(): Promise<string>;
  loadTokens(owner: string): Promise<string[]>;
  saveTokens(owner: string, tokens: string[]): Promise<void>;
  clearTokens(owner: string): Promise<void>;
  register(owner: string, token: string, previousToken: string | null): Promise<void>;
  unregister(owner: string, token: string): Promise<void>;
};

export function createTogetherPushLifecycle(deps: TogetherPushLifecycleDependencies) {
  let currentOwner: string | null = null;
  let generation = 0;
  let pending: Promise<void> = Promise.resolve();

  async function removeStored(owner: string) {
    const tokens = await deps.loadTokens(owner);
    for (const token of tokens) {
      await deps.unregister(owner, token);
      const remaining = (await deps.loadTokens(owner)).filter((stored) => stored !== token);
      if (remaining.length) await deps.saveTokens(owner, remaining);
      else await deps.clearTokens(owner);
    }
  }

  return {
    refresh(owner: string, enabled = true): Promise<void> {
      currentOwner = owner;
      const ticket = ++generation;
      const previous = pending;
      const work = (async () => {
        await previous.catch(() => {});
        if (currentOwner !== owner || generation !== ticket) return;
        if (!enabled || !(await deps.hasPermission())) {
          if (currentOwner === owner && generation === ticket) await removeStored(owner);
          return;
        }
        const token = await deps.getToken();
        if (currentOwner !== owner || generation !== ticket) return;
        const stored = await deps.loadTokens(owner);
        const previousToken = stored.find((item) => item !== token) ?? null;
        // Persist both addresses before the RPC. A failed registration or crash
        // cannot erase the prior address needed for logout cleanup.
        await deps.saveTokens(owner, [...new Set([...stored, token])]);
        if (currentOwner !== owner || generation !== ticket) return;
        await deps.register(owner, token, previousToken);
        if (currentOwner !== owner || generation !== ticket) return;
        for (const stale of stored) {
          if (stale !== token && stale !== previousToken) await deps.unregister(owner, stale);
        }
        await deps.saveTokens(owner, [token]);
      })();
      pending = work;
      return pending;
    },
    async beforeSignOut(owner: string): Promise<void> {
      if (currentOwner === owner) { currentOwner = null; generation += 1; }
      await pending.catch(() => {});
      await removeStored(owner);
    },
  };
}
