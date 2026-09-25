const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, 'betaFeedback.ts');
const inserts = [];
let currentUserId = 'A';
let insertError = null;
const supabase = {
  auth: { getSession: async () => ({ data: { session: currentUserId ? { user: { id: currentUserId } } : null }, error: null }) },
  from: (table) => {
    assert.equal(table, 'beta_feedback');
    return { insert: async (payload) => { inserts.push(payload); return { error: insertError }; } };
  },
};
const exportsValue = {};
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { exports: exportsValue, require: (name) => {
  if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { version: '1.0.0', android: { versionCode: 2 } }, platform: { android: { versionCode: 2 } } } };
  if (name === 'react-native') return { Platform: { OS: 'android', constants: { Model: 'Galaxy QA', Release: '16' } } };
  if (name.endsWith('/supabase')) return { supabase };
  throw new Error(`Unexpected dependency: ${name}`);
} }, { filename: file });

const input = { category: 'bug', screen: 'calendar', message: '  날짜가 보이지 않아요  ', wantsReply: false, contact: 'ignore@example.com' };
const metadata = { appVersion: '1.0.0', versionCode: '2', platform: 'android', deviceModel: 'Galaxy QA', osVersion: '16' };
const payload = exportsValue.createBetaFeedbackInsert('A', input, metadata);
assert.equal(payload.message, '날짜가 보이지 않아요');
assert.equal(payload.contact, null);
assert.deepEqual(Object.keys(payload).sort(), ['user_id', 'category', 'screen', 'message', 'wants_reply', 'contact', 'app_version', 'version_code', 'platform', 'device_model', 'os_version'].sort());
assert(!('status' in payload) && !('id' in payload) && !('created_at' in payload));
assert.equal(exportsValue.createBetaFeedbackInsert('A', { ...input, wantsReply: true, contact: ' hello@example.com ' }, metadata).contact, 'hello@example.com');
assert.throws(() => exportsValue.createBetaFeedbackInsert('A', { ...input, message: '   ' }, metadata));
assert.throws(() => exportsValue.createBetaFeedbackInsert('A', { ...input, message: 'a'.repeat(1001) }, metadata));
assert.equal(exportsValue.createBetaFeedbackInsert('A', { ...input, message: 'a'.repeat(1000) }, metadata).message.length, 1000);
assert.throws(() => exportsValue.createBetaFeedbackInsert('A', { ...input, category: 'invalid' }, metadata));

async function run() {
  await exportsValue.submitBetaFeedback('A', input);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].user_id, 'A');
  assert.equal(inserts[0].version_code, '2');
  assert.equal(inserts[0].device_model, 'Galaxy QA');
  currentUserId = 'B';
  await assert.rejects(exportsValue.submitBetaFeedback('A', input));
  assert.equal(inserts.length, 1, 'account switch must not send A feedback as B');
  currentUserId = null;
  await assert.rejects(exportsValue.submitBetaFeedback('A', input));
  assert.equal(inserts.length, 1, 'signed-out feedback must not be sent');
  currentUserId = 'A';
  insertError = { message: 'offline' };
  await assert.rejects(exportsValue.submitBetaFeedback('A', input), /네트워크/);
  console.log('PASS beta feedback payload, schema fields, limits, account isolation, metadata, insert failure');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
