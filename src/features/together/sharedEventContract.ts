const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SharedEvent = {
  id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  memo: string | null;
  startsAt: string;
  endsAt: string;
  placeName: string | null;
  placeAddress: string | null;
  placeLatitude: number | null;
  placeLongitude: number | null;
  kakaoPlaceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSharedEventInput = {
  spaceId: string;
  title: string;
  memo?: string | null;
  startsAt: string;
  endsAt: string;
  participantUserIds: string[];
  placeName?: string | null;
  placeAddress?: string | null;
  placeLatitude?: number | null;
  placeLongitude?: number | null;
  kakaoPlaceUrl?: string | null;
};

export type SharedEventRpcArgs = {
  p_space_id: string;
  p_title: string;
  p_starts_at: string;
  p_ends_at: string;
  p_participant_user_ids: string[];
  p_place_name: string | null;
  p_place_address: string | null;
  p_place_latitude: number | null;
  p_place_longitude: number | null;
  p_kakao_place_url: string | null;
  p_memo: string | null;
};

type SharedEventTransportResult = { data: unknown; error: unknown };

export type SharedEventServerTransport = {
  create: (args: SharedEventRpcArgs) => Promise<SharedEventTransportResult>;
  list: (spaceId: string) => Promise<SharedEventTransportResult>;
};

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isNullableFiniteNumber = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value));
const isIsoTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && !Number.isNaN(Date.parse(value));

export function parseSharedEvent(value: unknown): SharedEvent {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
  if (!row
    || !isUuid(row.id)
    || !isUuid(row.space_id)
    || !isUuid(row.created_by)
    || typeof row.title !== 'string'
    || !row.title.trim()
    || !isNullableString(row.memo)
    || !isIsoTimestamp(row.starts_at)
    || !isIsoTimestamp(row.ends_at)
    || Date.parse(row.starts_at) >= Date.parse(row.ends_at)
    || !isNullableString(row.place_name)
    || !isNullableString(row.place_address)
    || !isNullableFiniteNumber(row.place_latitude)
    || !isNullableFiniteNumber(row.place_longitude)
    || (row.place_latitude === null) !== (row.place_longitude === null)
    || !isNullableString(row.kakao_place_url)
    || !isIsoTimestamp(row.created_at)
    || !isIsoTimestamp(row.updated_at)) throw new Error('Invalid shared event');

  return {
    id: row.id,
    spaceId: row.space_id,
    createdBy: row.created_by,
    title: row.title,
    memo: row.memo,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    placeName: row.place_name,
    placeAddress: row.place_address,
    placeLatitude: row.place_latitude,
    placeLongitude: row.place_longitude,
    kakaoPlaceUrl: row.kakao_place_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSharedEventRpcArgs(input: CreateSharedEventInput): SharedEventRpcArgs {
  const title = input.title.trim();
  const latitude = input.placeLatitude ?? null;
  const longitude = input.placeLongitude ?? null;
  if (!isUuid(input.spaceId)
    || title.length < 1
    || title.length > 100
    || !isNullableString(input.memo ?? null)
    || !isIsoTimestamp(input.startsAt)
    || !isIsoTimestamp(input.endsAt)
    || Date.parse(input.startsAt) >= Date.parse(input.endsAt)
    || !Array.isArray(input.participantUserIds)
    || input.participantUserIds.some((userId) => !isUuid(userId))
    || new Set(input.participantUserIds).size !== input.participantUserIds.length
    || !isNullableString(input.placeName ?? null)
    || !isNullableString(input.placeAddress ?? null)
    || !isNullableString(input.kakaoPlaceUrl ?? null)
    || !isNullableFiniteNumber(latitude)
    || !isNullableFiniteNumber(longitude)
    || (latitude === null) !== (longitude === null)) throw new Error('Invalid shared event input');

  return {
    p_space_id: input.spaceId,
    p_title: title,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_participant_user_ids: [...input.participantUserIds],
    p_place_name: input.placeName ?? null,
    p_place_address: input.placeAddress ?? null,
    p_place_latitude: latitude,
    p_place_longitude: longitude,
    p_kakao_place_url: input.kakaoPlaceUrl ?? null,
    p_memo: input.memo ?? null,
  };
}

export function createSharedEventServerAdapter(transport: SharedEventServerTransport) {
  return {
    createSharedEvent: async (input: CreateSharedEventInput): Promise<string> => {
      const { data, error } = await transport.create(createSharedEventRpcArgs(input));
      if (error) throw error;
      if (!isUuid(data)) throw new Error('Invalid shared event id');
      return data;
    },
    listSharedEvents: async (spaceId: string): Promise<SharedEvent[]> => {
      if (!isUuid(spaceId)) throw new Error('Invalid together space id');
      const { data, error } = await transport.list(spaceId);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid shared events response');
      const events = data.map(parseSharedEvent);
      if (events.some((event) => event.spaceId !== spaceId)) throw new Error('Invalid shared events response');
      return events;
    },
  };
}
