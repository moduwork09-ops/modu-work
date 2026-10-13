export const TOGETHER_PUSH_MARKER = 'modu-work-together-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TogetherPushTap = {
  kind: 'created' | 'updated' | 'deleted';
  spaceId: string;
  eventId: string;
};

export function parseTogetherPushForOwner(data: Record<string, unknown>, owner: string | null | undefined): TogetherPushTap | null {
  if (!owner || data.managedBy !== TOGETHER_PUSH_MARKER || data.recipientUserId !== owner
    || typeof data.spaceId !== 'string' || !UUID.test(data.spaceId)
    || typeof data.eventId !== 'string' || !UUID.test(data.eventId)
    || (data.kind !== 'created' && data.kind !== 'updated' && data.kind !== 'deleted')) return null;
  return { kind: data.kind, spaceId: data.spaceId, eventId: data.eventId };
}

export function togetherPushTapDestination(tap: TogetherPushTap, eventExists: boolean) {
  return tap.kind === 'deleted' || !eventExists
    ? { pathname: '/together-group-detail' as const, params: { spaceId: tap.spaceId } }
    : { pathname: '/together-event-detail' as const, params: { spaceId: tap.spaceId, eventId: tap.eventId } };
}
