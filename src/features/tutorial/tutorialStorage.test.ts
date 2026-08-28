import { strict as assert } from 'node:assert';

import { createTutorialCompletionStore, getEntryDestination } from './tutorialStorage';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
}

async function run() {
  const storage = memoryStorage();
  const store = createTutorialCompletionStore(storage);
  const userAKey = 'modu-work.user.A.tutorial-completion.v1';
  const userBKey = 'modu-work.user.B.tutorial-completion.v1';

  assert.equal(store.getStorageKey('A'), userAKey);
  assert.equal(await store.load('A'), false);
  await store.complete('A');
  assert.equal(await store.load('A'), true);
  assert.equal(await store.load('B'), false);
  assert(storage.values.has(userAKey));
  assert(!storage.values.has(userBKey));
  storage.values.set(userBKey, 'invalid');
  assert.equal(await store.load('B'), false);

  assert.equal(getEntryDestination({ hasSession: false, hasCompletedSetup: false, tutorialCompleted: false }), '/auth');
  assert.equal(getEntryDestination({ hasSession: true, hasCompletedSetup: false, tutorialCompleted: false }), '/tutorial');
  assert.equal(getEntryDestination({ hasSession: true, hasCompletedSetup: false, tutorialCompleted: true }), '/onboarding');
  assert.equal(getEntryDestination({ hasSession: true, hasCompletedSetup: true, tutorialCompleted: false }), '/(tabs)');
  console.log('tutorial storage fixtures passed');
}

void run();
