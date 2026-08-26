import {
  formatAvailabilityMinute,
  getTogetherAvailabilityStatusMessage,
  isCurrentTogetherAvailabilityRequest,
  parseTogetherCommonAvailability,
  type TogetherAvailabilityRequestIdentity,
} from './commonAvailabilityPresentation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const readyRow = {
  local_date: '2026-08-26',
  availability_status: 'ready',
  timezone_name: 'Asia/Seoul',
  intervals: [{ start_minute: 540, end_minute: 840 }],
};

function expectRejected(value: unknown, message: string) {
  let rejected = false;
  try {
    parseTogetherCommonAvailability(value);
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

async function run() {
  assert(parseTogetherCommonAvailability(readyRow).intervals.length === 1, 'ready single interval');
  const multiple = parseTogetherCommonAvailability({
    ...readyRow,
    intervals: [{ start_minute: 540, end_minute: 840 }, { start_minute: 960, end_minute: 1380 }],
  });
  assert(multiple.intervals.length === 2, 'ready multiple intervals');
  assert(parseTogetherCommonAvailability({ ...readyRow, intervals: [] }).intervals.length === 0, 'ready empty');

  for (const status of ['sharing_disabled', 'not_synced', 'timezone_mismatch', 'not_enough_members'] as const) {
    const parsed = parseTogetherCommonAvailability({
      local_date: '2026-08-26', availability_status: status, timezone_name: null, intervals: [],
    });
    assert(parsed.availabilityStatus === status, `${status} status`);
  }
  const sharingMessage = getTogetherAvailabilityStatusMessage(parseTogetherCommonAvailability({
    local_date: '2026-08-26', availability_status: 'sharing_disabled', timezone_name: null, intervals: [],
  }));
  const syncingMessage = getTogetherAvailabilityStatusMessage(parseTogetherCommonAvailability({
    local_date: '2026-08-26', availability_status: 'not_synced', timezone_name: null, intervals: [],
  }));
  assert(sharingMessage !== syncingMessage, 'sharing disabled and not synced messages differ');
  assert(getTogetherAvailabilityStatusMessage(parseTogetherCommonAvailability({ ...readyRow, intervals: [] })) === '함께 가능한 시간이 없어요.', 'ready empty message');

  expectRejected({ ...readyRow, intervals: [{ start_minute: 600, end_minute: 540 }] }, 'invalid bounds');
  expectRejected({ ...readyRow, intervals: [{ start_minute: 540, end_minute: 555 }] }, 'under 30 minutes');
  expectRejected({ ...readyRow, intervals: [{ start_minute: 540, end_minute: 840 }, { start_minute: 800, end_minute: 900 }] }, 'overlap');
  expectRejected({ ...readyRow, timezone_name: null }, 'ready timezone required');
  expectRejected({ local_date: '2026-08-26', availability_status: 'not_synced', timezone_name: null, intervals: [{ start_minute: 540, end_minute: 840 }] }, 'non-ready intervals forbidden');

  let attempts = 0;
  const load = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('offline');
    return parseTogetherCommonAvailability(readyRow);
  };
  await load().then(() => assert(false, 'network error expected')).catch(() => undefined);
  assert((await load()).availabilityStatus === 'ready' && attempts === 2, 'retry succeeds');

  assert(formatAvailabilityMinute(0) === '00:00', 'minute zero');
  assert(formatAvailabilityMinute(1440) === '24:00', 'minute day end');

  const d1: TogetherAvailabilityRequestIdentity = { generation: 1, localDate: '2026-08-26', spaceId: 'A', userId: 'user' };
  const d2: TogetherAvailabilityRequestIdentity = { generation: 2, localDate: '2026-08-27', spaceId: 'A', userId: 'user' };
  assert(!isCurrentTogetherAvailabilityRequest(d2, d1), 'stale date response');
  const spaceB = { ...d2, spaceId: 'B' };
  assert(!isCurrentTogetherAvailabilityRequest(spaceB, d2), 'stale space response');
  const accountB = { ...d2, userId: 'other' };
  assert(!isCurrentTogetherAvailabilityRequest(accountB, d2), 'stale account response');
  assert(isCurrentTogetherAvailabilityRequest(d2, d2), 'current request');
}

void run().then(() => console.log('commonAvailabilityPresentation fixtures passed'));
