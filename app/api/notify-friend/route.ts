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
    .select(
      `id, from_id, to_id,
       from_profile:from_id (display_name),
       to_profile:to_id (display_name)`
    )
    .eq('id', requestId)
    .single();

  if (!req) return Response.json({ error: 'Not found' }, { status: 404 });

  const fromProfile = (req as any).from_profile;
  const toProfile = (req as any).to_profile;

  // Notify the recipient of a new request, or the sender when it's accepted.
  const notifyUserId = type === 'request' ? req.to_id : req.from_id;
  const title =
    type === 'request'
      ? `${fromProfile.display_name} sent you a friend request`
      : `${toProfile.display_name} accepted your friend request`;

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
