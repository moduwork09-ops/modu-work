const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const edgeFile = path.resolve(__dirname, '../../../supabase/functions/together-shared-event-push/index.ts');
const url = 'https://example.supabase.co';
const adminKey = 'test-admin-key';

function loadHandler(environment) {
  let handler;
  global.Deno = {
    env: { get: (name) => environment[name] },
    serve: (value) => { handler = value; },
  };
  delete require.cache[require.resolve(edgeFile)];
  require(edgeFile);
  return handler;
}

test('hosted named backend_admin key keeps user JWT separate from admin API key', async () => {
  const oldDeno = global.Deno;
  const oldFetch = global.fetch;
  const requests = [];
  try {
    const handler = loadHandler({ SUPABASE_URL: url, SUPABASE_SECRET_KEYS: JSON.stringify({ backend_admin: adminKey }) });
    global.fetch = async (requestUrl, options) => {
      requests.push({ url: requestUrl, ...options });
      if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) };
      if (requestUrl.endsWith('/rest/v1/rpc/claim_together_shared_event_push')) return { ok: true, json: async () => [] };
      throw new Error('Unexpected network request');
    };
    const response = await handler(new Request('https://example.com/push', {
      method: 'POST', headers: { authorization: 'Bearer user-jwt' },
    }));
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.apikey, adminKey);
    assert.equal(requests[0].headers.Authorization, 'Bearer user-jwt');
    assert.equal(requests[1].headers.apikey, adminKey);
    assert.equal('Authorization' in requests[1].headers, false);
  } finally {
    global.Deno = oldDeno;
    global.fetch = oldFetch;
  }
});

test('local admin variable works, while a missing new key fails closed', async () => {
  const oldDeno = global.Deno;
  const oldFetch = global.fetch;
  try {
    const handler = loadHandler({ SUPABASE_URL: url, BACKEND_ADMIN_KEY: adminKey });
    global.fetch = async (requestUrl) => {
      if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) };
      if (requestUrl.endsWith('/rest/v1/rpc/claim_together_shared_event_push')) return { ok: true, json: async () => [] };
      throw new Error('Unexpected network request');
    };
    assert.equal((await handler(new Request('https://example.com/push', {
      method: 'POST', headers: { authorization: 'Bearer user-jwt' },
    }))).status, 200);
    const unavailable = loadHandler({ SUPABASE_URL: url });
    assert.equal((await unavailable(new Request('https://example.com/push', {
      method: 'POST', headers: { authorization: 'Bearer user-jwt' },
    }))).status, 503);
  } finally {
    global.Deno = oldDeno;
    global.fetch = oldFetch;
  }
});

test('unregistered-token cleanup sends only the admin apikey', async () => {
  const oldDeno = global.Deno;
  const oldFetch = global.fetch;
  const requests = [];
  try {
    const handler = loadHandler({ SUPABASE_URL: url, BACKEND_ADMIN_KEY: adminKey });
    global.fetch = async (requestUrl, options) => {
      requests.push({ url: requestUrl, ...options });
      if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) };
      if (requestUrl.endsWith('/rest/v1/rpc/claim_together_shared_event_push')) return { ok: true, json: async () => [{
        delivery_id: '55555555-5555-4555-8555-555555555555',
        space_id: '33333333-3333-4333-8333-333333333333',
        event_id: '44444444-4444-4444-8444-444444444444',
        kind: 'created', title: '함께 일정', actor_name: '작성자',
        recipient_user_id: '22222222-2222-4222-8222-222222222222',
        token: 'ExponentPushToken[abc_123]',
      }] };
      if (requestUrl === 'https://exp.host/--/api/v2/push/send') return { ok: true, json: async () => ({
        data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }) };
      if (requestUrl.startsWith(`${url}/rest/v1/user_push_tokens?`)) return { ok: true };
      throw new Error('Unexpected network request');
    };
    assert.equal((await handler(new Request('https://example.com/push', {
      method: 'POST', headers: { authorization: 'Bearer user-jwt' },
    }))).status, 200);
    const cleanup = requests.find((item) => item.url.startsWith(`${url}/rest/v1/user_push_tokens?`));
    assert(cleanup);
    assert.equal(cleanup.method, 'DELETE');
    assert.equal(cleanup.headers.apikey, adminKey);
    assert.equal('Authorization' in cleanup.headers, false);
  } finally {
    global.Deno = oldDeno;
    global.fetch = oldFetch;
  }
});

test('Edge Function no longer reads the legacy service-role environment variable', () => {
  const source = fs.readFileSync(edgeFile, 'utf8');
  assert.equal(source.includes(['SUPABASE', 'SERVICE_ROLE_KEY'].join('_')), false);
  assert.match(source, /SUPABASE_SECRET_KEYS/);
  assert.match(source, /backend_admin/);
});
