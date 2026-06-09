'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import CheckInCard from '@/components/CheckInCard';
import PushSetup from '@/components/PushSetup';
import type { CheckIn } from '@/lib/types';

export default function HomePage() {
  const [feed, setFeed] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const fetchAllRef = useRef<() => void>(() => {});

  const buildFeed = useCallback((checkIns: CheckIn[]) => {
    const now = new Date();
    const active = checkIns.filter(
      (c) => !c.starts_at || new Date(c.starts_at) <= now
    );
    const upcoming = checkIns.filter(
      (c) => c.starts_at && new Date(c.starts_at) > now
    );

    active.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    upcoming.sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());

    setFeed([...active, ...upcoming]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function fetchAll() {
      const now = new Date().toISOString();

      const { data: checkIns } = await supabase
        .from('check_ins')
        .select(
          `id, user_id, floor, vibe, is_open, note, starts_at, expires_at, created_at,
           profiles:user_id (id, username, display_name, avatar_url),
           buildings:building_id (id, name, address)`
        )
        .gt('expires_at', now);

      buildFeed((checkIns as unknown as CheckIn[]) ?? []);
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

  const now = new Date();
  const activeCount = feed.filter((c) => !c.starts_at || new Date(c.starts_at) <= now).length;
  const upcomingCount = feed.filter((c) => c.starts_at && new Date(c.starts_at) > now).length;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <PushSetup />

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">wya</h1>
        {!loading && (
          <span className="text-sm text-gray-400">
            {activeCount} {activeCount === 1 ? 'person' : 'people'} out
            {upcomingCount > 0 && ` · ${upcomingCount} heading out soon`}
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
          {feed.map((checkIn) => (
            <CheckInCard
              key={checkIn.id}
              checkIn={checkIn}
              currentUserId={currentUserId}
              onUpdate={() => fetchAllRef.current()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
