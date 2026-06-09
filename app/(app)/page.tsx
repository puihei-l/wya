'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import CheckInCard from '@/components/CheckInCard';
import EventCard from '@/components/EventCard';
import PushSetup from '@/components/PushSetup';
import type { CheckIn, Hangout } from '@/lib/types';

type FeedItem =
  | { type: 'check_in'; data: CheckIn; sortKey: string }
  | { type: 'event'; data: Hangout; sortKey: string };

export default function HomePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const fetchAllRef = useRef<() => void>(() => {});

  const buildFeed = useCallback((checkIns: CheckIn[], hangouts: Hangout[]) => {
    const items: FeedItem[] = [
      ...checkIns.map((c) => ({ type: 'check_in' as const, data: c, sortKey: c.created_at })),
      ...hangouts.map((h) => ({ type: 'event' as const, data: h, sortKey: h.planned_at })),
    ];
    items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime());
    setFeed(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function fetchAll() {
      const now = new Date().toISOString();

      const [{ data: checkIns }, { data: hangouts }] = await Promise.all([
        supabase
          .from('check_ins')
          .select(
            `id, user_id, floor, vibe, is_open, note, expires_at, created_at,
             profiles:user_id (id, username, display_name, avatar_url),
             buildings:building_id (id, name, address)`
          )
          .gt('expires_at', now)
          .order('created_at', { ascending: false }),
        supabase
          .from('hangouts')
          .select(
            `id, title, planned_at, ends_at, note, creator_id,
             profiles:creator_id (id, username, display_name, avatar_url),
             buildings:building_id (id, name, address),
             hangout_participants (user_id, status)`
          )
          .lte('planned_at', now)
          .gte('ends_at', now)
          .order('planned_at', { ascending: false }),
      ]);

      buildFeed(
        (checkIns as unknown as CheckIn[]) ?? [],
        (hangouts as unknown as Hangout[]) ?? []
      );
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      fetchAllRef.current = fetchAll;

      await fetchAll();

      supabase
        .channel('feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, fetchAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hangout_participants' }, fetchAll)
        .subscribe();

      supabase
        .channel('my-memberships')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_group_members',
          filter: `user_id=eq.${user.id}`,
        }, fetchAll)
        .subscribe();
    }

    init();

    return () => { supabase.removeAllChannels(); };
  }, [buildFeed]);

  const checkInCount = feed.filter((f) => f.type === 'check_in').length;
  const eventCount = feed.filter((f) => f.type === 'event').length;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <PushSetup />

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">wya</h1>
        {!loading && (
          <span className="text-sm text-gray-400">
            {checkInCount} {checkInCount === 1 ? 'person' : 'people'} out
            {eventCount > 0 && ` · ${eventCount} happening now`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : feed.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">👀</p>
          <p className="text-gray-700 font-semibold text-lg">Nobody&apos;s out right now</p>
          <p className="text-gray-400 text-sm mt-1">Be the first to check in</p>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {feed.map((item) =>
            item.type === 'check_in' ? (
              <CheckInCard
                key={item.data.id}
                checkIn={item.data}
                currentUserId={currentUserId}
                onUpdate={() => fetchAllRef.current()}
              />
            ) : (
              <EventCard
                key={item.data.id}
                hangout={item.data}
                currentUserId={currentUserId}
                onUpdate={() => fetchAllRef.current()}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
