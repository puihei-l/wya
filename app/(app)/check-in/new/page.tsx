'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Building, Group, Vibe } from '@/lib/types';

const VIBES: { value: Vibe; emoji: string; label: string }[] = [
  { value: 'studying', emoji: '📚', label: 'Studying' },
  { value: 'chilling', emoji: '😌', label: 'Chilling' },
  { value: 'eating', emoji: '🍜', label: 'Eating' },
  { value: 'working', emoji: '💻', label: 'Working' },
  { value: 'gaming', emoji: '🎮', label: 'Gaming' },
];

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewCheckInPage() {
  const router = useRouter();
  const supabase = createClient();

  const [building, setBuilding] = useState<Building | null>(null);
  const [buildingQuery, setBuildingQuery] = useState('');
  const [buildingResults, setBuildingResults] = useState<Building[]>([]);
  const [showResults, setShowResults] = useState(false);

  const [floor, setFloor] = useState('');
  const [vibe, setVibe] = useState<Vibe | ''>('');
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [durationMs, setDurationMs] = useState(2 * 60 * 60 * 1000);
  const [hasActiveCheckIn, setHasActiveCheckIn] = useState(false);
  const [activeCheckInId, setActiveCheckInId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: groupData }, { data: activeData }] = await Promise.all([
        supabase.from('friend_groups').select('id, name, emoji, owner_id').eq('owner_id', user.id),
        supabase
          .from('check_ins')
          .select('id')
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
      ]);

      setGroups(groupData ?? []);
      if (activeData) {
        setHasActiveCheckIn(true);
        setActiveCheckInId(activeData.id);
      }
    }
    init();
  }, [supabase]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!buildingQuery.trim()) {
      setBuildingResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('buildings')
        .select('id, name, address')
        .ilike('name', `%${buildingQuery.trim()}%`)
        .limit(5);
      setBuildingResults(data ?? []);
      setShowResults(true);
    }, 300);
  }, [buildingQuery, supabase]);

  function selectBuilding(b: Building) {
    setBuilding(b);
    setBuildingQuery(b.name);
    setShowResults(false);
  }

  async function addNewBuilding() {
    const name = buildingQuery.trim();
    if (!name) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('buildings')
      .insert({ name, created_by: user!.id })
      .select('id, name, address')
      .single();
    if (data) selectBuilding(data);
  }

  async function endActiveCheckIn() {
    if (!activeCheckInId) return;
    await supabase
      .from('check_ins')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', activeCheckInId);
    setHasActiveCheckIn(false);
    setActiveCheckInId(null);
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  const isFuture = startsAt && new Date(startsAt) > new Date();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!building || !vibe || selectedGroups.length === 0) {
      setError('Select a location, vibe, and at least one group.');
      return;
    }

    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();

    const startMs = startsAt ? new Date(startsAt).getTime() : Date.now();
    const expiresAt = new Date(startMs + durationMs).toISOString();
    const startsAtIso = startsAt ? new Date(startsAt).toISOString() : null;

    const { data: checkIn, error: ciErr } = await supabase
      .from('check_ins')
      .insert({
        user_id: user!.id,
        building_id: building.id,
        floor: floor.trim() || null,
        vibe,
        is_open: isOpen,
        note: note.trim() || null,
        starts_at: startsAtIso,
        expires_at: expiresAt,
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
      p_group_ids: selectedGroups,
    });

    if (!isFuture) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInId: checkIn.id }),
      });
    }

    router.push('/');
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Check in</h1>

      {hasActiveCheckIn && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800">You&apos;re already checked in somewhere.</p>
          <button
            onClick={endActiveCheckIn}
            className="text-sm font-semibold text-amber-700 whitespace-nowrap"
          >
            End it
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Building */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
          <div className="relative">
            <input
              type="text"
              value={buildingQuery}
              onChange={(e) => { setBuildingQuery(e.target.value); setBuilding(null); }}
              onFocus={() => buildingResults.length > 0 && setShowResults(true)}
              placeholder="Search or add a building…"
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
                {buildingQuery.trim() && buildingResults.every((b) => b.name.toLowerCase() !== buildingQuery.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={addNewBuilding}
                    className="w-full text-left px-4 py-3 text-indigo-600 font-medium text-sm hover:bg-indigo-50"
                  >
                    + Add &ldquo;{buildingQuery.trim()}&rdquo;
                  </button>
                )}
              </div>
            )}
          </div>
          {building && (
            <p className="text-xs text-green-600 mt-1.5 ml-1">✓ {building.name}</p>
          )}
        </div>

        {/* Floor */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Floor <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="e.g. 3, Ground, Basement"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        {/* Vibe */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Vibe</label>
          <div className="grid grid-cols-5 gap-2">
            {VIBES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVibe(v.value)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                  vibe === v.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <span className="text-xl">{v.emoji}</span>
                <span className="text-xs font-medium text-gray-600">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Open toggle */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="font-medium text-gray-900 text-sm">Open to join</p>
            <p className="text-xs text-gray-400">Let friends know they can come find you</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              isOpen ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isOpen ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
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
            placeholder="e.g. Near the window seats"
            maxLength={100}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
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
              onChange={(e) => setStartsAt(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
            />
            {startsAt && (
              <button
                type="button"
                onClick={() => setStartsAt('')}
                className="text-sm text-gray-400 px-2"
              >
                Clear
              </button>
            )}
          </div>
          {isFuture && (
            <p className="text-xs text-indigo-600 mt-1.5 ml-1">Scheduled check-in — will appear when the time comes</p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            How long?{isFuture && <span className="font-normal text-gray-400"> (from start time)</span>}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '30m', ms: 30 * 60 * 1000 },
              { label: '1hr', ms: 60 * 60 * 1000 },
              { label: '2hr', ms: 2 * 60 * 60 * 1000 },
              { label: '4hr', ms: 4 * 60 * 60 * 1000 },
            ].map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setDurationMs(d.ms)}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  durationMs === d.ms
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-100 bg-white text-gray-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Share to groups</label>
          {groups.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-500">
                You haven&apos;t created any groups yet.{' '}
                <a href="/groups/new" className="text-indigo-600 font-medium">
                  Create one
                </a>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <label
                  key={g.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    selectedGroups.includes(g.id)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-100 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="sr-only"
                  />
                  <span className="text-xl">{g.emoji}</span>
                  <span className="font-medium text-gray-900 text-sm">{g.name}</span>
                  {selectedGroups.includes(g.id) && (
                    <span className="ml-auto text-indigo-600">✓</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !building || !vibe || selectedGroups.length === 0}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-base disabled:opacity-40"
        >
          {loading ? 'Saving…' : isFuture ? "I'll be there 📍" : "I'm here 📍"}
        </button>
      </form>
    </div>
  );
}
