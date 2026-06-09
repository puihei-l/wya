'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import CheckInCard from '@/components/CheckInCard';
import PushSetup from '@/components/PushSetup';
import type { CheckIn } from '@/lib/types';

export default function HomePage() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCheckIns = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('check_ins')
      .select(
        `id, user_id, floor, vibe, is_open, note, expires_at, created_at,
         profiles:user_id (id, username, display_name, avatar_url),
         buildings:building_id (id, name, address)`
      )
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    setCheckIns((data as unknown as CheckIn[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCheckIns();

    const supabase = createClient();
    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, fetchCheckIns)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCheckIns]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <PushSetup />

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">wya</h1>
        {!loading && (
          <span className="text-sm text-gray-400">
            {checkIns.length} {checkIns.length === 1 ? 'person' : 'people'} out
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : checkIns.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">👀</p>
          <p className="text-gray-700 font-semibold text-lg">Nobody&apos;s out right now</p>
          <p className="text-gray-400 text-sm mt-1">Be the first to check in</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkIns.map((c) => (
            <CheckInCard key={c.id} checkIn={c} />
          ))}
        </div>
      )}
    </div>
  );
}
