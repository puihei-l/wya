'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import CheckInCard from '@/components/CheckInCard';
import PushSetup from '@/components/PushSetup';
import { useGPSCoords } from '@/hooks/useGPSCoords';
import { haversineKm, GPS_SUGGESTIONS_KEY } from '@/lib/gps';
import type { CheckIn, Building } from '@/lib/types';

export default function HomePage() {
  const [active, setActive] = useState<CheckIn[]>([]);
  const [upcoming, setUpcoming] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const fetchAllRef = useRef<() => void>(() => {});

  const gpsCoords = useGPSCoords();
  const [nearbyBuilding, setNearbyBuilding] = useState<Building | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    if (!gpsCoords) return;
    if (typeof window !== 'undefined' && localStorage.getItem(GPS_SUGGESTIONS_KEY) !== 'true') return;
    const supabase = createClient();
    supabase
      .from('buildings')
      .select('id, name, address, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(50)
      .then(({ data }) => {
        const sorted = (data ?? [])
          .filter((b) => b.lat != null && b.lng != null && haversineKm(gpsCoords.lat, gpsCoords.lng, b.lat, b.lng) <= 0.1)
          .sort((a, b) => haversineKm(gpsCoords.lat, gpsCoords.lng, a.lat!, a.lng!) - haversineKm(gpsCoords.lat, gpsCoords.lng, b.lat!, b.lng!));
        setNearbyBuilding((sorted[0] as Building) ?? null);
        setSuggestionDismissed(false);
      });
  }, [gpsCoords]);

  const buildFeed = useCallback((checkIns: CheckIn[]) => {
    const now = new Date();
    const a = checkIns
      .filter((c) => !c.starts_at || new Date(c.starts_at) <= now)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const u = checkIns
      .filter((c) => c.starts_at && new Date(c.starts_at) > now)
      .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime());
    setActive(a);
    setUpcoming(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.removeAllChannels();
    let cancelled = false;

    async function fetchAll() {
      const now = new Date().toISOString();
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select(
          `id, user_id, floor, vibe, is_open, note, starts_at, expires_at, created_at, custom_location, planned_lat, planned_lng,
           profiles:user_id (id, username, display_name, avatar_url),
           buildings:building_id (id, name, address)`
        )
        .gt('expires_at', now);
      if (!cancelled) buildFeed((checkIns as unknown as CheckIn[]) ?? []);
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setCurrentUserId(user.id);
      fetchAllRef.current = fetchAll;
      await fetchAll();
      if (cancelled) return;

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
    return () => {
      cancelled = true;
      supabase.removeAllChannels();
    };
  }, [buildFeed]);

  const onUpdate = () => fetchAllRef.current();

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <PushSetup />

      {nearbyBuilding && !suggestionDismissed && !active.some((c) => c.user_id === currentUserId) && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-4">
          <Link
            href={`/check-in/new?buildingId=${nearbyBuilding.id}`}
            className="flex-1 flex items-center gap-3 min-w-0"
          >
            <span className="text-xl">📍</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-indigo-900 truncate">{nearbyBuilding.name}</p>
              <p className="text-xs text-indigo-500">You&apos;re nearby — check in?</p>
            </div>
          </Link>
          <button
            onClick={() => setSuggestionDismissed(true)}
            className="text-indigo-300 hover:text-indigo-500 text-lg leading-none flex-shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">wya</h1>
        {!loading && (
          <span className="text-sm text-gray-400">
            {active.length} {active.length === 1 ? 'person' : 'people'} out
            {upcoming.length > 0 && ` · ${upcoming.length} heading out soon`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : active.length === 0 && upcoming.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">👀</p>
          <p className="text-gray-700 font-semibold text-lg">Nobody&apos;s out right now</p>
          <p className="text-gray-400 text-sm mt-1">Be the first to check in</p>
        </div>
      ) : (
        <div className="pb-6">
          {active.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Nobody&apos;s out right now</p>
          ) : (
            <div className="space-y-3">
              {active.map((checkIn) => (
                <CheckInCard
                  key={checkIn.id}
                  checkIn={checkIn}
                  currentUserId={currentUserId}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Heading out soon
              </p>
              <div className="space-y-3">
                {upcoming.map((checkIn) => (
                  <CheckInCard
                    key={checkIn.id}
                    checkIn={checkIn}
                    currentUserId={currentUserId}
                    onUpdate={onUpdate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
