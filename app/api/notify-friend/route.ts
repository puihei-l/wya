import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? `mailto:${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const { requestId, type } = await request.json() as {
    requestId: string;
    type: 'request' | 'accepted';
  };

  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: req } = await admin
    .from('friend_requests')
    .select('id, from_id, to_id')
    .eq('id', requestId)
    .single();

  if (!req) return Response.json({ error: 'Not found' }, { status: 404 });

  const notifyUserId = type === 'request' ? req.to_id : req.from_id;
  const nameSourceId = type === 'request' ? req.from_id : req.to_id;

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', nameSourceId)
    .single();

  const title =
    type === 'request'
      ? `${profile?.display_name ?? 'Someone'} sent you a friend request`
      : `${profile?.display_name ?? 'Someone'} accepted your friend request`;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', notifyUserId);

  if (!subs?.length) return Response.json({ ok: true });

  const payload = JSON.stringify({ title, body: '', url: '/groups', tag: requestId });

  await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  return Response.json({ ok: true });
}
