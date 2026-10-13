import { strict as assert } from 'node:assert';

import {
  createSharedEventRpcArgs,
  createSharedEventServerAdapter,
  createUpdateSharedEventRpcArgs,
  parseSharedEvent,
  type SharedEventRpcArgs,
  type SharedEventServerTransport,
} from './sharedEventContract';

const spaceId = '11111111-1111-4111-8111-111111111111';
const otherSpaceId = '99999999-9999-4999-8999-999999999999';
const creatorId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444';
const startsAt = '2026-08-29T09:00:00+09:00';
const endsAt = '2026-08-29T11:00:00+09:00';
const row = {
  id: eventId,
  space_id: spaceId,
  created_by: creatorId,
  title: '같이 점심',
  memo: null as string | null,
  starts_at: startsAt,
  ends_at: endsAt,
  place_name: null,
  place_address: null,
  place_latitude: null,
  place_longitude: null,
  kakao_place_url: null,
  created_at: '2026-08-28T00:00:00Z',
  updated_at: '2026-08-28T00:00:00Z',
};

assert.equal(parseSharedEvent(row).spaceId, spaceId);
const input = {
  spaceId,
  title: '  같이 점심  ',
  memo: '',
  startsAt,
  endsAt,
  participantUserIds: [participantId],
};
assert.deepEqual(createSharedEventRpcArgs(input), {
  p_space_id: spaceId,
  p_title: '같이 점심',
  p_starts_at: startsAt,
  p_ends_at: endsAt,
  p_participant_user_ids: [participantId],
  p_place_name: null,
  p_place_address: null,
  p_place_latitude: null,
  p_place_longitude: null,
  p_kakao_place_url: null,
  p_memo: '',
});
const updateInput = { spaceId, eventId, title: '  저녁 식사  ', startsAt, endsAt, memo: '  메모  ' };
assert.deepEqual(createUpdateSharedEventRpcArgs(updateInput), {
  p_space_id: spaceId,
  p_event_id: eventId,
  p_title: '저녁 식사',
  p_starts_at: startsAt,
  p_ends_at: endsAt,
  p_memo: '메모',
});
assert.throws(() => createUpdateSharedEventRpcArgs({ ...updateInput, spaceId: 'bad' }));
assert.throws(() => createUpdateSharedEventRpcArgs({ ...updateInput, startsAt: endsAt }));

let createArgs: SharedEventRpcArgs | undefined;
let listedSpaceId: string | undefined;
let storedRow: typeof row | null = row;
let updateCount = 0;
let deleteCount = 0;
const transport: SharedEventServerTransport = {
  create: async (args) => {
    createArgs = args;
    return { data: eventId, error: null };
  },
  list: async (requestedSpaceId) => {
    listedSpaceId = requestedSpaceId;
    return { data: [row], error: null };
  },
  get: async (requestedSpaceId, requestedEventId) => ({
    data: requestedSpaceId === spaceId && requestedEventId === eventId ? storedRow : null,
    error: null,
  }),
  update: async (args) => {
    if (args.p_space_id !== spaceId) return { data: null, error: new Error('permission denied') };
    updateCount++;
    storedRow = { ...row, title: args.p_title, memo: args.p_memo, starts_at: args.p_starts_at, ends_at: args.p_ends_at };
    return { data: null, error: null };
  },
  delete: async () => {
    deleteCount++;
    storedRow = null;
    return { data: null, error: null };
  },
};
const adapter = createSharedEventServerAdapter(transport);

async function run() {
  assert.equal(await adapter.createSharedEvent(input), eventId);
  assert.equal(createArgs?.p_space_id, spaceId);
  assert.deepEqual(await adapter.listSharedEvents(spaceId), [parseSharedEvent(row)]);
  assert.equal(listedSpaceId, spaceId);
  assert.equal((await adapter.getSharedEvent(spaceId, eventId))?.title, row.title);
  assert.equal(await adapter.getSharedEvent(spaceId, '55555555-5555-4555-8555-555555555555'), null);
  assert.equal(await adapter.getSharedEvent(otherSpaceId, eventId), null);
  await assert.rejects(() => adapter.updateSharedEvent({ ...updateInput, spaceId: otherSpaceId }), /permission denied/);
  assert.equal(updateCount, 0);
  storedRow = row;
  const updated = await adapter.updateSharedEvent(updateInput);
  assert.equal(updated.title, '저녁 식사');
  assert.equal(updated.memo, '메모');
  assert.equal(updateCount, 1);
  await assert.rejects(() => adapter.deleteSharedEvent(otherSpaceId, eventId), /Shared event not found/);
  assert.equal(deleteCount, 0);
  await adapter.deleteSharedEvent(spaceId, eventId);
  assert.equal(deleteCount, 1);
  assert.equal(await adapter.getSharedEvent(spaceId, eventId), null);

  await assert.rejects(() => adapter.listSharedEvents('bad'), /Invalid together space id/);
  await assert.rejects(() => adapter.getSharedEvent('bad', eventId), /Invalid shared event identity/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, spaceId: 'bad' }), /Invalid shared event input/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, startsAt: endsAt }), /Invalid shared event input/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, placeLatitude: 37.5 }), /Invalid shared event input/);
  assert.throws(() => parseSharedEvent({ ...row, ends_at: startsAt }), /Invalid shared event/);

  const serverError = new Error('permission denied');
  const failingAdapter = createSharedEventServerAdapter({
    create: async () => ({ data: null, error: serverError }),
    list: async () => ({ data: null, error: serverError }),
    get: async () => ({ data: null, error: serverError }),
    update: async () => ({ data: null, error: serverError }),
    delete: async () => ({ data: null, error: serverError }),
  });
  await assert.rejects(() => failingAdapter.createSharedEvent(input), (error) => error === serverError);
  await assert.rejects(() => failingAdapter.listSharedEvents(spaceId), (error) => error === serverError);
  await assert.rejects(() => failingAdapter.getSharedEvent(spaceId, eventId), (error) => error === serverError);
  await assert.rejects(() => failingAdapter.updateSharedEvent(updateInput), (error) => error === serverError);
  await assert.rejects(() => failingAdapter.deleteSharedEvent(spaceId, eventId), (error) => error === serverError);
  const wrongSpaceAdapter = createSharedEventServerAdapter({
    ...transport,
    get: async () => ({ data: row, error: null }),
  });
  await assert.rejects(() => wrongSpaceAdapter.getSharedEvent(otherSpaceId, eventId), /Invalid shared event response/);
  await assert.rejects(() => wrongSpaceAdapter.deleteSharedEvent(otherSpaceId, eventId), /Invalid shared event response/);
}

void run().then(() => console.log('sharedEventServerData fixtures passed'));
