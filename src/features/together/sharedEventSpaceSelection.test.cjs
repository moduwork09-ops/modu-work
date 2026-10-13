const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { chooseSharedEventSpaceId, selectActiveSharedEventSpaces } = require('./sharedEventSpaceSelection.ts');
const { createSharedEventRpcArgs, createUpdateSharedEventRpcArgs } = require('./sharedEventContract.ts');

const userId = '11111111-1111-4111-8111-111111111111';
const aId = '22222222-2222-4222-8222-222222222222';
const bId = '33333333-3333-4333-8333-333333333333';
const outsiderId = '44444444-4444-4444-8444-444444444444';
const eventId = '55555555-5555-4555-8555-555555555555';
const member = (status, id = userId) => ({ userId: id, status });
const a = { space: { id: aId, name: 'A 그룹' }, members: [member('active'), member('active', outsiderId)] };
const b = { space: { id: bId, name: 'B 그룹' }, members: [member('active')] };
const invited = { space: { id: outsiderId, name: '초대 중' }, members: [member('invited')] };

assert.deepEqual(selectActiveSharedEventSpaces([], userId), []);
assert.equal(chooseSharedEventSpaceId([], aId), undefined, 'zero groups block creation');
const one = selectActiveSharedEventSpaces([a], userId);
assert.equal(chooseSharedEventSpaceId(one), aId, 'one active group is automatic');

const two = selectActiveSharedEventSpaces([a, b, invited], userId);
assert.deepEqual(two.map(({ space }) => space.id), [aId, bId], 'non-active group is not selectable');
assert.equal(chooseSharedEventSpaceId(two), undefined, 'generic route with two groups requires a choice');
assert.equal(chooseSharedEventSpaceId(two, aId), aId, 'valid route context preselects A');
assert.equal(chooseSharedEventSpaceId(two, bId), bId, 'valid route context preselects B');
assert.equal(chooseSharedEventSpaceId(two, outsiderId), undefined, 'non-member route falls back to picker');
assert.equal(chooseSharedEventSpaceId(two, 'invalid'), undefined, 'invalid route falls back to picker');
assert.equal(chooseSharedEventSpaceId(two, aId, bId), bId, 'explicit choice survives focus reload');
assert.equal(chooseSharedEventSpaceId([a], bId, bId), aId, 'removed group falls back to remaining active group');
assert.equal(chooseSharedEventSpaceId(two, outsiderId, outsiderId), undefined, 'stale selection cannot create');

const input = {
  title: '공동 일정',
  startsAt: '2026-10-13T09:00:00+09:00',
  endsAt: '2026-10-13T10:00:00+09:00',
  participantUserIds: [userId],
};
assert.equal(createSharedEventRpcArgs({ ...input, spaceId: chooseSharedEventSpaceId(two, undefined, aId) }).p_space_id, aId);
assert.equal(createSharedEventRpcArgs({ ...input, spaceId: chooseSharedEventSpaceId(two, undefined, bId) }).p_space_id, bId);
assert.equal(createUpdateSharedEventRpcArgs({
  spaceId: aId, eventId, title: input.title,
  startsAt: input.startsAt, endsAt: input.endsAt, memo: null,
}).p_space_id, aId, 'editing retains the original group');

console.log('shared event group selection fixtures passed');
