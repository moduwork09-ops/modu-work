import { strict as assert } from 'node:assert';

import {
  createSharedEventRpcArgs,
  createSharedEventServerAdapter,
  parseSharedEvent,
  type SharedEventRpcArgs,
  type SharedEventServerTransport,
} from './sharedEventContract';

const spaceId = '11111111-1111-4111-8111-111111111111';
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
  memo: null,
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

assert.deepEqual(parseSharedEvent(row), {
  id: eventId,
  spaceId,
  createdBy: creatorId,
  title: '같이 점심',
  memo: null,
  startsAt,
  endsAt,
  placeName: null,
  placeAddress: null,
  placeLatitude: null,
  placeLongitude: null,
  kakaoPlaceUrl: null,
  createdAt: '2026-08-28T00:00:00Z',
  updatedAt: '2026-08-28T00:00:00Z',
});

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

let createArgs: SharedEventRpcArgs | undefined;
let listedSpaceId: string | undefined;
const transport: SharedEventServerTransport = {
  create: async (args) => {
    createArgs = args;
    return { data: eventId, error: null };
  },
  list: async (requestedSpaceId) => {
    listedSpaceId = requestedSpaceId;
    return { data: [row], error: null };
  },
};
const adapter = createSharedEventServerAdapter(transport);

async function run() {
  assert.equal(await adapter.createSharedEvent(input), eventId);
  assert.equal(createArgs?.p_space_id, spaceId);
  assert.deepEqual(await adapter.listSharedEvents(spaceId), [parseSharedEvent(row)]);
  assert.equal(listedSpaceId, spaceId);

  await assert.rejects(() => adapter.listSharedEvents('bad'), /Invalid together space id/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, spaceId: 'bad' }), /Invalid shared event input/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, startsAt: endsAt }), /Invalid shared event input/);
  assert.throws(() => createSharedEventRpcArgs({ ...input, placeLatitude: 37.5 }), /Invalid shared event input/);
  assert.throws(() => parseSharedEvent({ ...row, ends_at: startsAt }), /Invalid shared event/);

  const serverError = new Error('server failed');
  const failingAdapter = createSharedEventServerAdapter({
    create: async () => ({ data: null, error: serverError }),
    list: async () => ({ data: null, error: serverError }),
  });
  await assert.rejects(() => failingAdapter.createSharedEvent(input), (error) => error === serverError);
  await assert.rejects(() => failingAdapter.listSharedEvents(spaceId), (error) => error === serverError);
}

void run().then(() => console.log('sharedEventServerData fixtures passed'));
