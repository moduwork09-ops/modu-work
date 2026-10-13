export const TOGETHER_PUSH_MARKER = 'modu-work-together-v1';

type Kind = 'created' | 'updated' | 'deleted';
export type ClaimedDelivery = {
  delivery_id: string;
  space_id: string;
  event_id: string;
  kind: Kind;
  title: string;
  actor_name: string;
  recipient_user_id: string;
  token: string;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  data: {
    managedBy: string;
    kind: Kind;
    spaceId: string;
    eventId: string;
    recipientUserId: string;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export function buildTogetherPushMessages(rows: ClaimedDelivery[], channelId: string): ExpoPushMessage[] {
  const seen = new Set<string>();
  const messages: ExpoPushMessage[] = [];
  for (const row of rows) {
    if (!UUID.test(row.delivery_id) || !UUID.test(row.space_id) || !UUID.test(row.event_id)
      || !UUID.test(row.recipient_user_id) || !TOKEN.test(row.token)
      || !['created', 'updated', 'deleted'].includes(row.kind)) continue;
    const key = `${row.delivery_id}:${row.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = row.title.trim().slice(0, 40) || '공동 일정';
    const actor = row.actor_name.trim().slice(0, 20) || '함께 멤버';
    const label = row.kind === 'created' ? '새 공동 일정'
      : row.kind === 'updated' ? '공동 일정 변경' : '공동 일정 취소';
    const body = row.kind === 'created' ? `${actor}님이 '${title}' 일정을 만들었어요.`
      : row.kind === 'updated' ? `'${title}' 일정이 변경됐어요.` : `'${title}' 일정이 취소됐어요.`;
    messages.push({
      to: row.token, title: label, body, sound: 'default', channelId,
      data: {
        managedBy: TOGETHER_PUSH_MARKER,
        kind: row.kind,
        spaceId: row.space_id,
        eventId: row.event_id,
        recipientUserId: row.recipient_user_id,
      },
    });
  }
  return messages;
}

export function chunkPushMessages<T>(values: T[], size = 100): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}
