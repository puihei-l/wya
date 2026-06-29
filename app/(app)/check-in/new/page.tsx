'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { Building, Group, Vibe } from '@/lib/types';
import { useGPSCoords } from '@/hooks/useGPSCoords';
import { haversineKm, GPS_SUGGESTIONS_KEY, GPS_CONTRIBUTE_KEY, isGenericBuildingName } from '@/lib/gps';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const VIBES: { value: Vibe; img: string; label: string }[] = [
  { value: 'chilling',   img: '/vibes/1.png', label: 'Chilling' },
  { value: 'exercising', img: '/vibes/2.png', label: 'Exercising' },
  { value: 'eating',     img: '/vibes/3.png', label: 'Eating' },
  { value: 'studying',   img: '/vibes/4.png', label: 'Studying' },
  { value: 'gaming',     img: '/vibes/5.png', label: 'Gaming' },
  { value: 'working',    img: '/vibes/6.png', label: 'Working' },
];

const INDEFINITE = -1;
const FAR_FUTURE = '2099-12-31T23:59:59Z';

const DURATIONS = [
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1hr', ms: 60 * 60 * 1000 },
  { label: '2hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4hr', ms: 4 * 60 * 60 * 1000 },
  { label: '∞', ms: INDEFINITE },
];

interface ClashingCheckIn {
  id: string;
  expires_at: string;
  starts_at: string | null;
  buildings: { name: string } | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function calcExpiresAt(startMs: number, durationMs: number): string {
  return durationMs === INDEFINITE ? FAR_FUTURE : new Date(startMs + durationMs).toISOString();
}

function isValidBuildingName(s: string): boolean {
  const t = s.trim();
  return t.length >= 3 && /[a-zA-Z]/.test(t) && /^[a-zA-Z0-9 \-']+$/.test(t);
}

export default function NewCheckInPage() {
  const router = useRouter();
  const supabase = createClient();
  const gpsCoords = useGPSCoords();

  // Keep a ref so search closures always read the latest coords without
  // triggering a re-search when GPS resolves mid-session.
  const gpsCoordsRef = useRef(gpsCoords);
  useEffect(() => { gpsCoordsRef.current = gpsCoords; }, [gpsCoords]);

  const [building, setBuilding] = useState<Building | null>(null);
  const [buildingQuery, setBuildingQuery] = useState('');
  const [buildingResults, setBuildingResults] = useState<Building[]>([]);
  const [showResults, setShowResults] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFloors, setNewFloors] = useState('');
  const [newFloorLabel, setNewFloorLabel] = useState('Floor');
  const [newSpots, setNewSpots] = useState('');
  const [newPinGps, setNewPinGps] = useState(false);
  const [addingBuilding, setAddingBuilding] = useState(false);

  const [floor, setFloor] = useState('');
  const [vibe, setVibe] = useState<Vibe | ''>('chilling');
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [shareAll, setShareAll] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [showGpsSettings, setShowGpsSettings] = useState(false);
  const [gpsSuggestions, setGpsSuggestions] = useState(false);
  const [gpsContribute, setGpsContribute] = useState(false);

  const [plannedLat, setPlannedLat] = useState<number | null>(null);
  const [plannedLng, setPlannedLng] = useState<number | null>(null);
  // Resolved once we have a GPS fix or a building with known coords.
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapIsDefault, setMapIsDefault] = useState(false);
  const [mapFlyTo, setMapFlyTo] = useState<{ lat: number; lng: number; t: number } | undefined>();

  const [durationMs, setDurationMs] = useState(2 * 60 * 60 * 1000);
  const [clash, setClash] = useState<ClashingCheckIn | null>(null);
  const [pendingExpiresAt, setPendingExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setGpsSuggestions(localStorage.getItem(GPS_SUGGESTIONS_KEY) === 'true');
    setGpsContribute(localStorage.getItem(GPS_CONTRIBUTE_KEY) === 'true');
  }, []);

  async function toggleGpsSuggestions() {
    if (gpsSuggestions) {
      localStorage.setItem(GPS_SUGGESTIONS_KEY, 'false');
      localStorage.setItem(GPS_CONTRIBUTE_KEY, 'false');
      setGpsSuggestions(false);
      setGpsContribute(false);
      return;
    }
    if (!navigator.geolocation) return;
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          localStorage.setItem(GPS_SUGGESTIONS_KEY, 'true');
          setGpsSuggestions(true);
          resolve();
        },
        () => resolve(),
        { timeout: 10000 },
      );
    });
  }

  function toggleGpsContribute() {
    if (!gpsSuggestions) return;
    const next = !gpsContribute;
    localStorage.setItem(GPS_CONTRIBUTE_KEY, String(next));
    setGpsContribute(next);
  }

  const fetchNearby = useCallback(async (): Promise<Building[]> => {
    const coords = gpsCoordsRef.current;
    if (!coords) return [];
    const { data } = await supabase
      .from('buildings')
      .select('id, name, address, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(50);
    return (data ?? [])
      .filter((b) => b.lat != null && b.lng != null && haversineKm(coords.lat, coords.lng, b.lat, b.lng) <= 0.1)
      .sort((a, b) => haversineKm(coords.lat, coords.lng, a.lat!, a.lng!) - haversineKm(coords.lat, coords.lng, b.lat!, b.lng!))
      .slice(0, 5);
  }, [supabase]);

  // Pre-populate nearby results as soon as GPS resolves (if the query is still empty).
  useEffect(() => {
    if (!gpsCoords || buildingQuery.trim()) return;
    fetchNearby().then(setBuildingResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsCoords]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: groupData } = await supabase
        .from('friend_groups')
        .select('id, name, emoji, owner_id')
        .eq('owner_id', user.id);
      setGroups(groupData ?? []);
    }
    init();
  }, [supabase]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!buildingQuery.trim()) {
      // Query cleared — switch back to nearby list (or close if GPS unavailable).
      fetchNearby().then((results) => {
        setBuildingResults(results);
        if (results.length === 0) setShowResults(false);
      });
      return;
    }
    // Typing — plain string match, no GPS filtering.
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('buildings')
        .select('id, name, address, lat, lng')
        .ilike('name', `%${buildingQuery.trim()}%`)
        .limit(5);
      setBuildingResults(data ?? []);
      setShowResults(true);
    }, 300);
  }, [buildingQuery, supabase, fetchNearby]);

  function selectBuilding(b: Building) {
    setBuilding(b);
    setBuildingQuery(b.name);
    setShowResults(false);
  }

  // Resolve map center from GPS or selected building coords.
  useEffect(() => {
    if (mapCenter) return;
    if (gpsCoords) { setMapCenter([gpsCoords.lat, gpsCoords.lng]); return; }
    if (building?.lat != null && building?.lng != null) {
      setMapCenter([building.lat, building.lng]);
    }
  }, [gpsCoords, building, mapCenter]);

  // Fallback: show the map after 5s even without a known location.
  useEffect(() => {
    const t = setTimeout(() => {
      setMapCenter((c) => { if (c) return c; setMapIsDefault(true); return [-37.8136, 144.9631]; });
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Pre-fill building from URL param (e.g. tapped suggestion banner on home page).
  useEffect(() => {
    const buildingId = new URLSearchParams(window.location.search).get('buildingId');
    if (!buildingId) return;
    supabase
      .from('buildings')
      .select('id, name, address, lat, lng')
      .eq('id', buildingId)
      .single()
      .then(({ data }) => { if (data) selectBuilding(data as Building); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAddForm() {
    setNewName(buildingQuery.trim());
    setNewFloors('');
    setNewFloorLabel('Floor');
    setNewSpots('');
    setNewPinGps(gpsSuggestions && gpsCoordsRef.current !== null);
    setShowResults(false);
    setShowAddForm(true);
  }

  async function submitNewBuilding() {
    const name = newName.trim();
    if (!name) return;
    setAddingBuilding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const spotsArray = newSpots.trim()
      ? newSpots.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    const coords = gpsCoordsRef.current;

    const { data } = await supabase
      .from('buildings')
      .insert({
        name,
        created_by: user!.id,
        num_floors: newFloors ? parseInt(newFloors, 10) : null,
        floor_label: newFloorLabel,
        notable_spots: spotsArray,
        ...(newPinGps && coords ? { lat: coords.lat, lng: coords.lng } : {}),
      })
      .select('id, name, address, num_floors, floor_label, notable_spots, lat, lng')
      .single();
    setAddingBuilding(false);
    if (data) {
      selectBuilding(data);
      setShowAddForm(false);
    }
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  async function saveCheckIn(userId: string, shortenClash: boolean, groupIds: string[], overrideExpiresAt?: string) {
    const startMs = startsAt ? new Date(startsAt).getTime() : Date.now();
    const newStartsAt = new Date(startMs).toISOString();
    const expiresAt = overrideExpiresAt ?? calcExpiresAt(startMs, durationMs);

    if (shortenClash && clash) {
      await supabase
        .from('check_ins')
        .update({ expires_at: newStartsAt })
        .eq('id', clash.id);
    }

    // Contribute GPS for existing buildings (newly-added ones already have coords set on insert).
    const isFutureCheckIn = startsAt && new Date(startsAt) > new Date();
    const coords = gpsCoordsRef.current;
    if (
      building &&
      !isFutureCheckIn &&
      coords &&
      localStorage.getItem(GPS_CONTRIBUTE_KEY) === 'true' &&
      !isGenericBuildingName(building.name)
    ) {
      // Fire-and-forget. Averaging happens atomically in the SECURITY DEFINER function
      // since buildings has no direct UPDATE policy.
      supabase
        .rpc('contribute_building_location', {
          p_building_id: building.id,
          p_lat: coords.lat,
          p_lng: coords.lng,
        })
        .then(() => {});
    }

    const { data: checkIn, error: ciErr } = await supabase
      .from('check_ins')
      .insert({
        user_id: userId,
        building_id: building?.id ?? null,
        custom_location: building ? null : buildingQuery.trim() || null,
        floor: floor.trim() || null,
        vibe,
        is_open: isOpen,
        note: note.trim() || null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        expires_at: expiresAt,
        planned_lat: plannedLat,
        planned_lng: plannedLng,
      })
      .select('id')
      .single();

    if (ciErr || !checkIn) {
      setError(ciErr?.message ?? 'Something went wrong');
      setLoading(false);
      return;
    }

    await supabase.rpc('link_check_in_to_groups', {
      p_check_in_id: checkIn.id,
      p_group_ids: groupIds,
    });

    if (!startsAt || new Date(startsAt) <= new Date()) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInId: checkIn.id }),
      });
    }

    router.push('/');
  }

  const groupsToShare = shareAll ? groups.map((g) => g.id) : selectedGroups;

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if ((!building && !buildingQuery.trim()) || !vibe || groupsToShare.length === 0) {
      setError('Type a location, pick a vibe, and select at least one group.');
      return;
    }

    setLoading(true);
    setError('');
    setClash(null);

    const { data: { user } } = await supabase.auth.getUser();
    const startMs = startsAt ? new Date(startsAt).getTime() : Date.now();
    const newStartsAt = new Date(startMs).toISOString();
    let newExpiresAt = calcExpiresAt(startMs, durationMs);

    if (durationMs === INDEFINITE) {
      const { data: nextPlanned } = await supabase
        .from('check_ins')
        .select('starts_at')
        .eq('user_id', user!.id)
        .gt('starts_at', newStartsAt)
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextPlanned?.starts_at) newExpiresAt = nextPlanned.starts_at;
    }

    setPendingExpiresAt(newExpiresAt);

    const { data: existing } = await supabase
      .from('check_ins')
      .select('id, expires_at, starts_at, buildings:building_id (name)')
      .eq('user_id', user!.id)
      .gt('expires_at', newStartsAt)
      .or(`starts_at.is.null,starts_at.lt.${newExpiresAt}`)
      .maybeSingle();

    if (existing) {
      setClash(existing as unknown as ClashingCheckIn);
      setLoading(false);
      return;
    }

    await saveCheckIn(user!.id, false, groupsToShare, newExpiresAt);
  }

  const isFuture = startsAt && new Date(startsAt) > new Date();

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Check in</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Building */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
          {!showAddForm && (
            <div className="relative" ref={searchContainerRef}>
              <input
                type="text"
                value={buildingQuery}
                onChange={(e) => { setBuildingQuery(e.target.value); setBuilding(null); }}
                onFocus={async () => {
                  if (buildingResults.length > 0) {
                    setShowResults(true);
                  } else if (!buildingQuery.trim()) {
                    const results = await fetchNearby();
                    setBuildingResults(results);
                    if (results.length > 0) setShowResults(true);
                  }
                }}
                placeholder="Search for a place…"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
                autoComplete="off"
              />
              {showResults && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
                  {buildingResults.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => selectBuilding(b)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-gray-900 text-sm">{b.name}</p>
                      {b.address && <p className="text-xs text-gray-400">{b.address}</p>}
                    </button>
                  ))}
                  {isValidBuildingName(buildingQuery) &&
                    buildingResults.every((b) => b.name.toLowerCase() !== buildingQuery.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onClick={openAddForm}
                      className="w-full text-left px-4 py-3 text-indigo-600 font-medium text-sm hover:bg-indigo-50"
                    >
                      + Add &ldquo;{buildingQuery.trim()}&rdquo;
                    </button>
                  )}
                </div>
              )}
              {building && <p className="text-xs text-green-600 mt-1.5 ml-1">✓ {building.name}</p>}
            </div>
          )}

          {!showAddForm && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowGpsSettings((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-500 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Location settings
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showGpsSettings ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showGpsSettings && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-start justify-between gap-4 px-3 py-2.5 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">Nearby suggestions</p>
                      <p className="text-xs text-gray-400 mt-0.5">Rank buildings by distance. Stays on-device.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleGpsSuggestions}
                      className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${gpsSuggestions ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${gpsSuggestions ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className={`flex items-start justify-between gap-4 px-3 py-2.5 bg-gray-50 rounded-xl transition-opacity ${!gpsSuggestions ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">Improve location data</p>
                      <p className="text-xs text-gray-400 mt-0.5">Share coordinates when checking in to help pin buildings.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleGpsContribute}
                      disabled={!gpsSuggestions}
                      className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${gpsContribute ? 'bg-indigo-600' : 'bg-gray-200'} disabled:cursor-not-allowed`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${gpsContribute ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showAddForm && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Add new place</p>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-gray-400">Cancel</button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Building name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              {gpsSuggestions && gpsCoordsRef.current && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Pin to current location</p>
                    <p className="text-xs text-gray-400 mt-0.5">Save your GPS coordinates with this place.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewPinGps((v) => !v)}
                    className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${newPinGps ? 'bg-indigo-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${newPinGps ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={submitNewBuilding}
                disabled={addingBuilding || !newName.trim()}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {addingBuilding ? 'Adding…' : 'Add place'}
              </button>
            </div>
          )}
        </div>

        {/* Floor */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Area <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="e.g. 3rd floor, Room 204, Rooftop"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        {/* Vibe */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Vibe</label>
          <div className="grid grid-cols-3 gap-2">
            {VIBES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVibe(v.value)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                  vibe === v.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                }`}
              >
                <img src={v.img} alt={v.label} className="w-7 h-7 object-contain" />
                <span className="text-xs font-medium text-gray-600">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Open toggle */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={isOpen ? '/unlock.png' : '/lock.png'} alt={isOpen ? 'Open' : 'Closed'} className="w-5 h-5 object-contain" />
            <div>
              <p className="font-medium text-gray-900 text-sm">{isOpen ? 'Open to join' : 'Not open'}</p>
              <p className="text-xs text-gray-400">Let friends know they can come find you</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isOpen ? 'bg-indigo-600' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOpen ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a comment…"
            maxLength={100}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        {/* Pin location */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">
              Pin location <span className="font-normal text-gray-400">(optional)</span>
            </label>
            {plannedLat != null && (
              <button
                type="button"
                onClick={() => { setPlannedLat(null); setPlannedLng(null); }}
                className="text-xs text-gray-400 hover:text-red-400"
              >
                Clear pin
              </button>
            )}
          </div>
          {mapCenter ? (
            <div className="space-y-1.5">
              <MapView
                lat={plannedLat}
                lng={plannedLng}
                initLat={mapCenter[0]}
                initLng={mapCenter[1]}
                initZoom={mapIsDefault ? 11 : 16}
                flyTo={mapFlyTo}
                onPick={(lat, lng) => { setPlannedLat(lat); setPlannedLng(lng); }}
                height="192px"
              />
              <p className="text-xs text-gray-400 text-center">
                {plannedLat != null ? '📍 Pin placed — tap map to move it' : 'Tap the map to drop a pin'}
              </p>
              {gpsCoords && (
                <button
                  type="button"
                  onClick={() => {
                    setPlannedLat(gpsCoords.lat);
                    setPlannedLng(gpsCoords.lng);
                    setMapFlyTo({ lat: gpsCoords.lat, lng: gpsCoords.lng, t: Date.now() });
                  }}
                  className="text-xs text-indigo-600 font-medium"
                >
                  Use my current location
                </button>
              )}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-400">Getting your location…</p>
            </div>
          )}
        </div>

        {/* Start time */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Start time <span className="font-normal text-gray-400">(optional, defaults to now)</span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="datetime-local"
              value={startsAt}
              min={toDatetimeLocal(new Date())}
              onChange={(e) => { setStartsAt(e.target.value); setClash(null); }}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
            />
            {startsAt && (
              <button type="button" onClick={() => { setStartsAt(''); setClash(null); }} className="text-sm text-gray-400 px-2">
                Clear
              </button>
            )}
          </div>
          {isFuture && (
            <p className="text-xs text-indigo-600 mt-1.5 ml-1">Scheduled — will appear when the time comes</p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            How long?{isFuture && <span className="font-normal text-gray-400"> (from start time)</span>}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setDurationMs(d.ms)}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  durationMs === d.ms ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-white text-gray-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Share with</label>
          {groups.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-500">
                You haven&apos;t created any groups yet.{' '}
                <a href="/groups/new" className="text-indigo-600 font-medium">Create one</a>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                shareAll ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
              }`}>
                <input type="checkbox" checked={shareAll} onChange={() => setShareAll((v) => !v)} className="sr-only" />
                <span className="font-medium text-gray-900 text-sm">All friends</span>
                <span className="text-xs text-gray-400">({groups.length} {groups.length === 1 ? 'group' : 'groups'})</span>
                {shareAll && <span className="ml-auto text-indigo-600">✓</span>}
              </label>

              {!shareAll && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-gray-100 flex-1" />
                    <span className="text-xs text-gray-300">or pick groups</span>
                    <div className="h-px bg-gray-100 flex-1" />
                  </div>
                  {groups.map((g) => (
                    <label
                      key={g.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                        selectedGroups.includes(g.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} className="sr-only" />
                      <span className="text-xl">{g.emoji}</span>
                      <span className="font-medium text-gray-900 text-sm">{g.name}</span>
                      {selectedGroups.includes(g.id) && <span className="ml-auto text-indigo-600">✓</span>}
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Clash resolution */}
        {clash && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-sm text-amber-800 font-medium">Check-in clash</p>
            <p className="text-sm text-amber-700">
              {clash.buildings ? `You're checked in at ${clash.buildings.name}` : 'You have an active check-in'} until {formatTime(clash.expires_at)}.
              {isFuture
                ? ` Your new check-in starts at ${formatTime(startsAt)} — the current one needs to end first.`
                : ' End it and check in here instead?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  const { data: { user } } = await supabase.auth.getUser();
                  await saveCheckIn(user!.id, true, groupsToShare, pendingExpiresAt ?? undefined);
                }}
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold"
              >
                {isFuture ? `Shorten to end at ${formatTime(startsAt)}` : 'End & check in here'}
              </button>
              <button
                type="button"
                onClick={() => setClash(null)}
                className="flex-1 py-2.5 bg-white border border-amber-300 text-amber-700 rounded-xl text-sm font-semibold"
              >
                {isFuture ? 'Adjust start time' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {!clash && (
          <button
            type="submit"
            disabled={loading || (!building && !buildingQuery.trim()) || !vibe || groupsToShare.length === 0}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-base disabled:opacity-40"
          >
            {loading ? 'Saving…' : isFuture ? "I'll be there 📍" : "I'm here 📍"}
          </button>
        )}
      </form>
    </div>
  );
}
