'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Building, Group } from '@/lib/types';

export default function NewHangoutPage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [plannedAt, setPlannedAt] = useState('');
  const [note, setNote] = useState('');
  const [building, setBuilding] = useState<Building | null>(null);
  const [buildingQuery, setBuildingQuery] = useState('');
  const [buildingResults, setBuildingResults] = useState<Building[]>([]);
  const [showBuildingResults, setShowBuildingResults] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('friend_groups')
        .select('id, name, emoji, owner_id')
        .eq('owner_id', user.id);
      setGroups(data ?? []);
    }
    init();
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!buildingQuery.trim()) { setBuildingResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('buildings')
        .select('id, name, address')
        .ilike('name', `%${buildingQuery.trim()}%`)
        .limit(5);
      setBuildingResults(data ?? []);
      setShowBuildingResults(true);
    }, 300);
  }, [buildingQuery]);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !plannedAt || selectedGroups.length === 0) {
      setError('Add a title, date/time, and at least one group.');
      return;
    }
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();

    const { data: hangout, error: hErr } = await supabase
      .from('hangouts')
      .insert({
        creator_id: user!.id,
        title: title.trim(),
        planned_at: new Date(plannedAt).toISOString(),
        building_id: building?.id ?? null,
        note: note.trim() || null,
      })
      .select('id')
      .single();

    if (hErr || !hangout) {
      setError(hErr?.message ?? 'Something went wrong');
      setLoading(false);
      return;
    }

    // Add creator as going
    await supabase.from('hangout_participants').insert({ hangout_id: hangout.id, user_id: user!.id, status: 'going' });

    // Share to groups (invite group members)
    await supabase.rpc('link_hangout_to_groups', {
      p_hangout_id: hangout.id,
      p_group_ids: selectedGroups,
    });

    router.push('/hangouts');
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-6">
      <button onClick={() => router.back()} className="text-sm text-gray-400 mb-6 flex items-center gap-1">
        ← Back
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Plan a hangout</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">What</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Library session, Coffee run"
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">When</label>
          <input
            type="datetime-local"
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Where <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={buildingQuery}
              onChange={(e) => { setBuildingQuery(e.target.value); setBuilding(null); }}
              placeholder="Search buildings…"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
              autoComplete="off"
            />
            {showBuildingResults && buildingResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10">
                {buildingResults.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { setBuilding(b); setBuildingQuery(b.name); setShowBuildingResults(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm"
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to add?"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Invite groups</label>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">
              <a href="/groups/new" className="text-indigo-600">Create a group</a> first.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <label
                  key={g.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer ${
                    selectedGroups.includes(g.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} className="sr-only" />
                  <span className="text-xl">{g.emoji}</span>
                  <span className="font-medium text-gray-900 text-sm">{g.name}</span>
                  {selectedGroups.includes(g.id) && <span className="ml-auto text-indigo-600">✓</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !title.trim() || !plannedAt || selectedGroups.length === 0}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-base disabled:opacity-40"
        >
          {loading ? 'Planning…' : 'Plan it 📅'}
        </button>
      </form>
    </div>
  );
}
