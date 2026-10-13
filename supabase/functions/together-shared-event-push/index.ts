// @ts-ignore Deno requires the local .ts extension; Expo's tsconfig does not enable it.
import { buildTogetherPushMessages, chunkPushMessages, type ClaimedDelivery } from './pushCore.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const channelId = 'modu-work-local-v1';
const expoEndpoint = 'https://exp.host/--/api/v2/push/send';

type ExpoTicket = { status?: string; details?: { error?: string } };

function getBackendAdminKey(): string | null {
  const localKey = Deno.env.get('BACKEND_ADMIN_KEY');
  if (localKey) return localKey;
  // Hosted Edge Functions inject named Secret Keys in this JSON map.
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeys) return null;
  try {
    const backendAdmin = (JSON.parse(secretKeys) as Record<string, unknown>).backend_admin;
    return typeof backendAdmin === 'string' && backendAdmin ? backendAdmin : null;
  } catch {
    return null;
  }
}

async function removeUnregisteredToken(url: string, adminKey: string, token: string) {
  const query = new URLSearchParams({ token: `eq.${token}` });
  await fetch(`${url}/rest/v1/user_push_tokens?${query}`, {
    method: 'DELETE',
    headers: { apikey: adminKey },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const url = Deno.env.get('SUPABASE_URL');
  const adminKey = getBackendAdminKey();
  if (!url || !adminKey) return Response.json({ error: 'Push service unavailable' }, { status: 503 });
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(authorization)) return Response.json({ error: 'Authentication required' }, { status: 401 });

  try {
    // The client never supplies an actor, space, recipient, or token. Verify the
    // actual user JWT and claim only outbox entries produced by committed CRUD.
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: adminKey, Authorization: authorization },
    });
    if (!userResponse.ok) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== 'string') return Response.json({ error: 'Authentication required' }, { status: 401 });

    const claimResponse = await fetch(`${url}/rest/v1/rpc/claim_together_shared_event_push`, {
      method: 'POST',
      headers: {
        apikey: adminKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_actor: user.id }),
    });
    if (!claimResponse.ok) return Response.json({ error: 'Push queue unavailable' }, { status: 502 });
    const claimed = await claimResponse.json() as ClaimedDelivery[];
    const messages = buildTogetherPushMessages(Array.isArray(claimed) ? claimed : [], channelId);
    let accepted = 0;
    for (const batch of chunkPushMessages(messages)) {
      const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      const response = await fetch(expoEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) throw new Error('Expo push request failed');
      const result = await response.json() as { data?: ExpoTicket[] };
      const tickets = Array.isArray(result.data) ? result.data : [];
      accepted += tickets.filter((ticket) => ticket.status === 'ok').length;
      await Promise.all(tickets.map((ticket, index) =>
        ticket.details?.error === 'DeviceNotRegistered' && batch[index]
          ? removeUnregisteredToken(url, adminKey, batch[index].to).catch(() => {})
          : Promise.resolve()));
    }
    return Response.json({ claimed: claimed.length, attempted: messages.length, accepted });
  } catch {
    // Shared-event CRUD has already committed; push delivery is best effort.
    return Response.json({ error: 'Push delivery unavailable' }, { status: 502 });
  }
});
