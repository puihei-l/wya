import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const VIBE_EMOJI: Record<string, string> = {
  studying: '📚',
  chilling: '😌',
  eating: '🍜',
  working: '💻',
  gaming: '🎮',
};

export async function POST(request: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? `mailto:${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const { checkInId } = await request.json();

  // Verify caller is authenticated
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Get check-in details
  const { data: checkIn, error: checkInError } = await admin
    .from('check_ins')
    .select(
      `id, vibe, is_open, user_id,
       profiles:user_id (display_name),
       buildings:building_id (name)`
    )
    .eq('id', checkInId)
    .single();

  if (checkInError) return Response.json({ error: checkInError.message }, { status: 500 });
  if (!checkIn) return Response.json({ error: 'Not found' }, { status: 404 });

  // Get groups this check-in is shared to
  const { data: ciGroups } = await admin
    .from('check_in_groups')
    .select('group_id')
    .eq('check_in_id', checkInId);

  if (!ciGroups?.length) return Response.json({ ok: true });

  const groupIds = ciGroups.map((g) => g.group_id);

  // Get unique members of those groups (excluding the check-in author)
  const { data: members } = await admin
    .from('friend_group_members')
    .select('user_id')
    .in('group_id', groupIds)
    .neq('user_id', checkIn.user_id);

  if (!members?.length) return Response.json({ ok: true });

  const userIds = [...new Set(members.map((m) => m.user_id))];

  // Get push subscriptions for those users
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (!subs?.length) return Response.json({ ok: true });

  const profile = (checkIn as any).profiles;
  const building = (checkIn as any).buildings;
  const payload = JSON.stringify({
    title: `${profile.display_name} is at ${building.name}`,
    body: `${VIBE_EMOJI[checkIn.vibe] ?? ''} ${checkIn.vibe}${checkIn.is_open ? ' · open to join!' : ''}`,
    url: '/',
    tag: checkInId,
  });

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
