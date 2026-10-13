const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { createTogetherPushLifecycle } = require('./togetherPushLifecycle.ts');
const { parseTogetherPushForOwner, togetherPushTapDestination } = require('./togetherPushNotification.ts');
const { afterSharedEventCommit } = require('../together/sharedEventPushFlow.ts');
const { buildTogetherPushMessages, chunkPushMessages, TOGETHER_PUSH_MARKER } =
  require('../../../supabase/functions/together-shared-event-push/pushCore.ts');
const actor = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const space = '33333333-3333-4333-8333-333333333333';
const event = '44444444-4444-4444-8444-444444444444';
const delivery = '55555555-5555-4555-8555-555555555555';
const token = 'ExponentPushToken[abc_123]';

function fixture(kind) {
  return { delivery_id: delivery, space_id: space, event_id: event, kind,
    title: '함께 점심', actor_name: '철수', recipient_user_id: member, token };
}
function lifecycleHarness() {
  const stored = new Map(); const calls = [];
  let nextToken = token, permission = true, failRegister = false, failUnregister = false;
  const lifecycle = createTogetherPushLifecycle({
    hasPermission: async () => permission,
    getToken: async () => nextToken,
    loadTokens: async owner => stored.get(owner) || [],
    saveTokens: async (owner, tokens) => { stored.set(owner, tokens); },
    clearTokens: async owner => { stored.delete(owner); },
    register: async (owner, value, prior) => { calls.push(['register', owner, value, prior]); if (failRegister) throw Error('register failed'); },
    unregister: async (owner, value) => { calls.push(['unregister', owner, value]); if (failUnregister) throw Error('unregister failed'); },
  });
  return { lifecycle, stored, calls, setToken: value => { nextToken = value; },
    setPermission: value => { permission = value; }, setFailRegister: value => { failRegister = value; },
    setFailUnregister: value => { failUnregister = value; } };
}

test('CRUD messages target only claimed recipient tokens and dedupe a delivery', () => {
  for (const [kind, expected] of [['created','새 공동 일정'], ['updated','공동 일정 변경'], ['deleted','공동 일정 취소']]) {
    const messages = buildTogetherPushMessages([fixture(kind), fixture(kind)], 'modu-work-local-v1');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].title, expected);
    assert.equal(messages[0].data.recipientUserId, member);
    assert.equal(messages[0].data.spaceId, space);
    assert.equal(messages[0].data.eventId, event);
    assert.equal(messages[0].data.managedBy, TOGETHER_PUSH_MARKER);
    assert.equal(messages[0].to, token);
  }
  assert.equal(buildTogetherPushMessages([{ ...fixture('created'), token: 'invalid' }], 'channel').length, 0);
  assert.deepEqual(chunkPushMessages(Array(201).fill(1)).map(batch => batch.length), [100,100,1]);
});

test('tap navigation accepts only matching account and valid Together identifiers', () => {
  const data = buildTogetherPushMessages([fixture('deleted')], 'channel')[0].data;
  assert.deepEqual(parseTogetherPushForOwner(data, member), { kind:'deleted', spaceId:space, eventId:event });
  assert.equal(parseTogetherPushForOwner(data, actor), null);
  assert.equal(parseTogetherPushForOwner({ ...data, spaceId:'bad' }, member), null);
  assert.equal(parseTogetherPushForOwner({ managedBy:'modu-work.local.v1', ...data }, null), null);
  const deleted = parseTogetherPushForOwner(data, member);
  assert.equal(togetherPushTapDestination(deleted, false).pathname, '/together-group-detail');
  assert.equal(togetherPushTapDestination({ ...deleted, kind:'created' }, true).pathname, '/together-event-detail');
  assert.equal(togetherPushTapDestination({ ...deleted, kind:'updated' }, false).pathname, '/together-group-detail');
});

test('push dispatch is post-commit and best effort', async () => {
  let attempts = 0;
  await assert.rejects(afterSharedEventCommit(async () => { throw Error('CRUD failed'); }, async () => { attempts++; }), /CRUD failed/);
  assert.equal(attempts, 0);
  assert.equal(await afterSharedEventCommit(async () => 'saved', async () => { attempts++; throw Error('push failed'); }), 'saved');
  assert.equal(attempts, 1);
});

test('token rotation retains both addresses after failure and unregisters them on logout', async () => {
  const h = lifecycleHarness();
  await h.lifecycle.refresh(actor);
  const next = 'ExpoPushToken[new-token]';
  h.setToken(next); h.setFailRegister(true);
  await assert.rejects(h.lifecycle.refresh(actor), /register failed/);
  assert.deepEqual(h.stored.get(actor), [token, next]);
  h.setFailRegister(false);
  await h.lifecycle.beforeSignOut(actor);
  assert.equal(h.stored.has(actor), false);
  assert(h.calls.some(call => call[0] === 'unregister' && call[2] === token));
  assert(h.calls.some(call => call[0] === 'unregister' && call[2] === next));
});

test('logout waits pending registration and keeps local token if server cleanup fails', async () => {
  const h = lifecycleHarness();
  await h.lifecycle.refresh(actor);
  h.setFailUnregister(true);
  await assert.rejects(h.lifecycle.beforeSignOut(actor), /unregister failed/);
  assert.deepEqual(h.stored.get(actor), [token]);
  h.setFailUnregister(false);
  await h.lifecycle.beforeSignOut(actor);
  assert.equal(h.stored.has(actor), false);
});

test('global notification OFF unregisters this device without prompting', async () => {
  const h = lifecycleHarness();
  await h.lifecycle.refresh(actor);
  await h.lifecycle.refresh(actor, false);
  assert.equal(h.stored.has(actor), false);
  assert(h.calls.some(call => call[0] === 'unregister' && call[1] === actor));
});

test('permission denial removes registered address without prompting', async () => {
  const h = lifecycleHarness();
  await h.lifecycle.refresh(actor);
  h.setPermission(false);
  await h.lifecycle.refresh(actor);
  assert.equal(h.stored.has(actor), false);
});

test('migration enforces server-only recipient selection and private token storage', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261013150000_add_together_shared_event_push.sql'), 'utf8');
  assert.match(sql, /alter table public\.user_push_tokens enable row level security/i);
  assert.match(sql, /revoke all on table public\.user_push_tokens from public, anon, authenticated/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /m\.status = 'active'/i);
  assert.match(sql, /m\.user_id <> c\.actor_id/i);
  assert.match(sql, /actor_membership\.status = 'active'/i);
  assert.match(sql, /m\.space_id = c\.space_id/i);
  assert.match(sql, /revoke all on function public\.claim_together_shared_event_push\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.claim_together_shared_event_push\(uuid\) to service_role/i);
  assert.match(sql, /after insert or update or delete on public\.shared_events/i);
});

test('owner switch invalidates stale token acquisition before server registration', async () => {
  let releaseA;
  const registered = [];
  const tokens = new Map();
  const lifecycle = createTogetherPushLifecycle({
    hasPermission: async () => true,
    getToken: () => new Promise(resolve => {
      if (!releaseA) releaseA = resolve;
      else resolve(token);
    }),
    loadTokens: async owner => tokens.get(owner) || [],
    saveTokens: async (owner, list) => { tokens.set(owner, list); },
    clearTokens: async owner => { tokens.delete(owner); },
    register: async owner => { registered.push(owner); },
    unregister: async () => {},
  });
  const old = lifecycle.refresh(actor);
  while (!releaseA) await new Promise(resolve => setImmediate(resolve));
  const next = lifecycle.refresh(member);
  releaseA(token);
  await Promise.all([old, next]);
  assert.deepEqual(registered, [member]);
  assert.equal(tokens.has(actor), false);
});


test('OFF request supersedes an in-flight registration for the same owner', async () => {
  let releaseToken;
  const calls = [];
  const stored = new Map();
  const lifecycle = createTogetherPushLifecycle({
    hasPermission: async () => true,
    getToken: () => new Promise(resolve => { releaseToken = resolve; }),
    loadTokens: async owner => stored.get(owner) || [],
    saveTokens: async (owner, values) => { stored.set(owner, values); },
    clearTokens: async owner => { stored.delete(owner); },
    register: async () => { calls.push('register'); },
    unregister: async () => { calls.push('unregister'); },
  });
  const initial = lifecycle.refresh(actor);
  while (!releaseToken) await new Promise(resolve => setImmediate(resolve));
  const off = lifecycle.refresh(actor, false);
  releaseToken(token);
  await Promise.all([initial, off]);
  assert.deepEqual(calls, []);
  assert.equal(stored.has(actor), false);
});
