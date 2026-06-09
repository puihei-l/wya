'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Hangout, Building } from '@/lib/types';

const DURATIONS = [
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1hr', ms: 60 * 60 * 1000 },
  { label: '2hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4hr', ms: 4 * 60 * 60 * 1000 },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function snapDuration(ms: number): number {
  return DURATIONS.map((d) => d.ms).reduce((prev, curr) =>
    Math.abs(curr - ms) < Math.abs(prev - ms) ? curr : prev
  );
}

export default function HangoutsPage() {
  const supabase = createClient();
  const [hangouts, setHangouts] = useState<Hangout[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPlannedAt, setEditPlannedAt] = useState('');
  const [editDurationMs, setEditDurationMs] = useState(2 * 60 * 60 * 1000);
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);
  const [editBuildingQuery, setEditBuildingQuery] = useState('');
  const [editBuildingResults, setEditBuildingResults] = useState<Building[]>([]);
  const [editShowBuildingResults, setEditShowBuildingResults] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchHangouts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase
      .from('hangouts')
      .select(
        `id, title, planned_at, ends_at, note, creator_id,
         profiles:creator_id (id, username, display_name, avatar_url),
         buildings:building_id (id, name, address),
         hangout_participants (user_id, status)`
      )
      .gte('planned_at', new Date().toISOString())
      .order('planned_at', { ascending: true });

    setHangouts((data as unknown as Hangout[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchHangouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(h: Hangout) {
    const currentDuration = new Date(h.ends_at).getTime() - new Date(h.planned_at).getTime();
    setEditingId(h.id);
    setEditTitle(h.title);
    setEditPlannedAt(toDatetimeLocal(h.planned_at));
    setEditDurationMs(snapDuration(currentDuration));
    setEditBuilding(h.buildings);
    setEditBuildingQuery(h.buildings?.name ?? '');
    setEditBuildingResults([]);
    setEditShowBuildingResults(false);
    setEditNote(h.note ?? '');
    setConfirmDeleteId(null);
  }

  function closeEdit() {
    setEditingId(null);
    setConfirmDeleteId(null);
  }

  function handleEditBuildingSearch(q: string) {
    setEditBuildingQuery(q);
    setEditBuilding(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setEditBuildingResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('buildings')
        .select('id, name, address')
        .ilike('name', `%${q.trim()}%`)
        .limit(5);
      setEditBuildingResults(data ?? []);
      setEditShowBuildingResults(true);
    }, 300);
  }

  async function handleSave() {
    if (!editTitle.trim() || !editPlannedAt || !editingId) return;
    setSaving(true);
    await supabase
      .from('hangouts')
      .update({
        title: editTitle.trim(),
        planned_at: new Date(editPlannedAt).toISOString(),
        ends_at: new Date(new Date(editPlannedAt).getTime() + editDurationMs).toISOString(),
        building_id: editBuilding?.id ?? null,
        note: editNote.trim() || null,
      })
      .eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    await fetchHangouts();
  }

  async function handleDelete(id: string) {
    await supabase.from('hangouts').delete().eq('id', id);
    await fetchHangouts();
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
        <div className="space-y-3 pb-6">
          {hangouts.map((h) => {
            const isCreator = h.creator_id === currentUserId;
            const isThisEditing = editingId === h.id;

            return (
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {!isThisEditing ? (
                  isCreator ? (
                    <button
                      onClick={() => openEdit(h)}
                      className="w-full text-left p-4 active:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{h.title}</p>
                        <span className="text-xs bg-indigo-50 text-indigo-600 font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                          You planned
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{formatDate(h.planned_at)}</p>
                      {h.buildings && <p className="text-sm text-gray-500 mb-1">📍 {h.buildings.name}</p>}
                      {h.note && <p className="text-sm text-gray-400 italic">&ldquo;{h.note}&rdquo;</p>}
                      <p className="text-xs text-gray-300 mt-2 text-right">Tap to edit</p>
                    </button>
                  ) : (
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{h.title}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          by {h.profiles.display_name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{formatDate(h.planned_at)}</p>
                      {h.buildings && <p className="text-sm text-gray-500 mb-1">📍 {h.buildings.name}</p>}
                      {h.note && <p className="text-sm text-gray-400 italic">&ldquo;{h.note}&rdquo;</p>}
                    </div>
                  )
                ) : (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 text-sm">Edit plan</p>
                      <button onClick={closeEdit} className="text-xs text-gray-400">Cancel</button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">What</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">When</label>
                      <input
                        type="datetime-local"
                        value={editPlannedAt}
                        onChange={(e) => setEditPlannedAt(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">How long?</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {DURATIONS.map((d) => (
                          <button
                            key={d.label}
                            type="button"
                            onClick={() => setEditDurationMs(d.ms)}
                            className={`py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                              editDurationMs === d.ms
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                : 'border-gray-100 bg-white text-gray-600'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Where</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={editBuildingQuery}
                          onChange={(e) => handleEditBuildingSearch(e.target.value)}
                          placeholder="Search buildings…"
                          autoComplete="off"
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                        {editShowBuildingResults && editBuildingResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10">
                            {editBuildingResults.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => { setEditBuilding(b); setEditBuildingQuery(b.name); setEditShowBuildingResults(false); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm"
                              >
                                {b.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {editBuilding && (
                        <p className="text-xs text-green-600 mt-1">✓ {editBuilding.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Note</label>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Anything to add?"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>

                    <button
                      onClick={handleSave}
                      disabled={saving || !editTitle.trim() || !editPlannedAt}
                      className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>

                    {confirmDeleteId !== h.id ? (
                      <button
                        onClick={() => setConfirmDeleteId(h.id)}
                        className="w-full py-2 text-xs text-red-400 hover:text-red-600"
                      >
                        Cancel plan
                      </button>
                    ) : (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                        <p className="text-xs text-red-700 font-medium text-center">Cancel this plan?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDelete(h.id)}
                            className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold"
                          >
                            Yes, cancel
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold"
                          >
                            Keep it
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
