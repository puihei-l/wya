'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Hangout, Building } from '@/lib/types';

const DURATIONS = [
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1hr', ms: 60 * 60 * 1000 },
  { label: '2hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4hr', ms: 4 * 60 * 60 * 1000 },
];

function timeLeft(endsAt: string) {
  const mins = Math.floor((new Date(endsAt).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
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

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
      {name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function EventCard({
  hangout,
  currentUserId,
  onUpdate,
}: {
  hangout: Hangout;
  currentUserId: string;
  onUpdate?: () => void;
}) {
  const isCreator = hangout.creator_id === currentUserId;
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const currentDuration = new Date(hangout.ends_at).getTime() - new Date(hangout.planned_at).getTime();
  const [title, setTitle] = useState(hangout.title);
  const [plannedAt, setPlannedAt] = useState(toDatetimeLocal(hangout.planned_at));
  const [durationMs, setDurationMs] = useState(snapDuration(currentDuration));
  const [note, setNote] = useState(hangout.note ?? '');
  const [building, setBuilding] = useState<Building | null>(hangout.buildings);
  const [buildingQuery, setBuildingQuery] = useState(hangout.buildings?.name ?? '');
  const [buildingResults, setBuildingResults] = useState<Building[]>([]);
  const [showBuildingResults, setShowBuildingResults] = useState(false);
  const [saving, setSaving] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = timeLeft(hangout.ends_at);

  function handleBuildingSearch(q: string) {
    setBuildingQuery(q);
    setBuilding(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setBuildingResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('buildings')
        .select('id, name, address')
        .ilike('name', `%${q.trim()}%`)
        .limit(5);
      setBuildingResults(data ?? []);
      setShowBuildingResults(true);
    }, 300);
  }

  async function handleSave() {
    if (!title.trim() || !plannedAt) return;
    const supabase = createClient();
    setSaving(true);
    await supabase
      .from('hangouts')
      .update({
        title: title.trim(),
        planned_at: new Date(plannedAt).toISOString(),
        ends_at: new Date(new Date(plannedAt).getTime() + durationMs).toISOString(),
        building_id: building?.id ?? null,
        note: note.trim() || null,
      })
      .eq('id', hangout.id);
    setSaving(false);
    setIsEditing(false);
    onUpdate?.();
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('hangouts').delete().eq('id', hangout.id);
    onUpdate?.();
  }

  const cardBody = (
    <div className="flex gap-3">
      <Avatar name={hangout.profiles.display_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-gray-900 truncate">{hangout.profiles.display_name}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-200 text-indigo-700 flex-shrink-0">
            📅 Happening now
          </span>
        </div>
        <p className="text-sm font-medium text-gray-800 mt-0.5">{hangout.title}</p>
        {hangout.buildings && (
          <p className="text-sm text-gray-500 mt-0.5 truncate">📍 {hangout.buildings.name}</p>
        )}
        {left && <p className="text-xs text-gray-400 mt-2">{left}</p>}
        {hangout.note && (
          <p className="text-sm text-gray-500 mt-2 italic">&ldquo;{hangout.note}&rdquo;</p>
        )}
      </div>
    </div>
  );

  if (!isCreator) {
    return (
      <div className="bg-indigo-50 rounded-2xl p-4 shadow-sm border border-indigo-100">
        {cardBody}
      </div>
    );
  }

  return (
    <div className="bg-indigo-50 rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
      {!isEditing ? (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full text-left p-4 active:bg-indigo-100"
        >
          {cardBody}
          <p className="text-xs text-indigo-300 mt-2 text-right">Tap to edit</p>
        </button>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">Edit event</p>
            <button
              onClick={() => { setIsEditing(false); setConfirmDelete(false); }}
              className="text-xs text-gray-400"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">What</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">When</label>
            <input
              type="datetime-local"
              value={plannedAt}
              onChange={(e) => setPlannedAt(e.target.value)}
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
                  onClick={() => setDurationMs(d.ms)}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                    durationMs === d.ms
                      ? 'border-indigo-500 bg-white text-indigo-700'
                      : 'border-indigo-100 bg-indigo-50 text-gray-600'
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
                value={buildingQuery}
                onChange={(e) => handleBuildingSearch(e.target.value)}
                placeholder="Search buildings…"
                autoComplete="off"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              {showBuildingResults && buildingResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10">
                  {buildingResults.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { setBuilding(b); setBuildingQuery(b.name); setShowBuildingResults(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-sm"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {building && <p className="text-xs text-green-600 mt-1">✓ {building.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to add?"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !plannedAt}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-xs text-red-400 hover:text-red-600"
            >
              Delete event
            </button>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-700 font-medium text-center">Delete this event?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
