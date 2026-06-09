'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Hangout } from '@/lib/types';

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function HangoutsPage() {
  const supabase = createClient();
  const [hangouts, setHangouts] = useState<Hangout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    async function fetchHangouts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Get hangouts the user created or is a participant of
      const { data } = await supabase
        .from('hangouts')
        .select(
          `id, title, planned_at, note, creator_id,
           profiles:creator_id (id, username, display_name, avatar_url),
           buildings:building_id (id, name, address),
           hangout_participants (user_id, status)`
        )
        .gte('planned_at', new Date().toISOString())
        .order('planned_at', { ascending: true });

      setHangouts((data as unknown as Hangout[]) ?? []);
      setLoading(false);
    }
    fetchHangouts();
  }, []);

  async function updateRsvp(hangoutId: string, status: string) {
    await supabase.from('hangout_participants').upsert(
      { hangout_id: hangoutId, user_id: currentUserId, status },
      { onConflict: 'hangout_id,user_id' }
    );
    setHangouts((prev) =>
      prev.map((h) => {
        if (h.id !== hangoutId) return h;
        return {
          ...h,
          hangout_participants: h.hangout_participants.map((p) =>
            p.user_id === currentUserId ? { ...p, status } : p
          ),
        };
      })
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
        <Link
          href="/hangouts/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
        >
          + Plan
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : hangouts.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">📅</p>
          <p className="text-gray-700 font-semibold text-lg">No upcoming plans</p>
          <p className="text-gray-400 text-sm mt-1">Plan a hangout with your friends</p>
          <Link
            href="/hangouts/new"
            className="inline-block mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm"
          >
            Plan something
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {hangouts.map((h) => {
            const myRsvp = h.hangout_participants.find((p) => p.user_id === currentUserId);
            const goingCount = h.hangout_participants.filter((p) => p.status === 'going').length;
            const isCreator = h.creator_id === currentUserId;

            return (
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{h.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(h.planned_at)}</p>
                  </div>
                  {isCreator && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                      You planned
                    </span>
                  )}
                </div>

                {h.buildings && (
                  <p className="text-sm text-gray-500 mb-2">📍 {h.buildings.name}</p>
                )}
                {h.note && (
                  <p className="text-sm text-gray-400 italic mb-3">&ldquo;{h.note}&rdquo;</p>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{goingCount} going</p>

                  {!isCreator && (
                    <div className="flex gap-1.5">
                      {(['going', 'maybe', 'not_going'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateRsvp(h.id, s)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                            myRsvp?.status === s
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {s === 'going' ? '✅' : s === 'maybe' ? '🤔' : '❌'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
