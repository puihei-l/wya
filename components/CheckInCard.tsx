'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CheckIn, Vibe } from '@/lib/types';

const VIBE: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  studying: { emoji: '📚', label: 'Studying', bg: 'bg-amber-100', text: 'text-amber-700' },
  chilling: { emoji: '😌', label: 'Chilling', bg: 'bg-green-100', text: 'text-green-700' },
  eating: { emoji: '🍜', label: 'Eating', bg: 'bg-orange-100', text: 'text-orange-700' },
  working: { emoji: '💻', label: 'Working', bg: 'bg-blue-100', text: 'text-blue-700' },
  gaming: { emoji: '🎮', label: 'Gaming', bg: 'bg-purple-100', text: 'text-purple-700' },
};

const DURATIONS = [
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1hr', ms: 60 * 60 * 1000 },
  { label: '2hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4hr', ms: 4 * 60 * 60 * 1000 },
];

function timeAgo(date: string) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function timeLeft(expires: string) {
  const mins = Math.floor((new Date(expires).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

export default function CheckInCard({
  checkIn,
  currentUserId,
  onUpdate,
}: {
  checkIn: CheckIn;
  currentUserId: string;
  onUpdate?: () => void;
}) {
  const isOwner = checkIn.user_id === currentUserId;
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [floor, setFloor] = useState(checkIn.floor ?? '');
  const [vibe, setVibe] = useState<Vibe>(checkIn.vibe);
  const [isOpen, setIsOpen] = useState(checkIn.is_open);
  const [note, setNote] = useState(checkIn.note ?? '');
  const [durationMs, setDurationMs] = useState(2 * 60 * 60 * 1000);
  const [saving, setSaving] = useState(false);

  const vibeInfo = VIBE[checkIn.vibe] ?? VIBE.chilling;
  const left = timeLeft(checkIn.expires_at);

  async function handleSave() {
    const supabase = createClient();
    setSaving(true);
    await supabase
      .from('check_ins')
      .update({
        floor: floor.trim() || null,
        vibe,
        is_open: isOpen,
        note: note.trim() || null,
        expires_at: new Date(Date.now() + durationMs).toISOString(),
      })
      .eq('id', checkIn.id);
    setSaving(false);
    setIsEditing(false);
    onUpdate?.();
  }

  async function handleEnd() {
    const supabase = createClient();
    await supabase
      .from('check_ins')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', checkIn.id);
    onUpdate?.();
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('check_ins').delete().eq('id', checkIn.id);
    onUpdate?.();
  }

  const cardBody = (
    <div className="flex gap-3">
      <Avatar name={checkIn.profiles.display_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-gray-900 truncate">{checkIn.profiles.display_name}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(checkIn.created_at)}</span>
        </div>
        <p className="text-sm text-gray-600 truncate mt-0.5">
          {checkIn.buildings.name}
          {checkIn.floor && <span className="text-gray-400"> · Floor {checkIn.floor}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${vibeInfo.bg} ${vibeInfo.text}`}>
            {vibeInfo.emoji} {vibeInfo.label}
          </span>
          {checkIn.is_open && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
              ✌️ Open to join
            </span>
          )}
          {left && <span className="text-xs text-gray-400 ml-auto">{left}</span>}
        </div>
        {checkIn.note && (
          <p className="text-sm text-gray-500 mt-2 italic">&ldquo;{checkIn.note}&rdquo;</p>
        )}
      </div>
    </div>
  );

  if (!isOwner) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        {cardBody}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {!isEditing ? (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full text-left p-4 active:bg-gray-50"
        >
          {cardBody}
          <p className="text-xs text-gray-300 mt-2 text-right">Tap to edit</p>
        </button>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 text-sm">Edit check-in</p>
            <button
              onClick={() => { setIsEditing(false); setConfirmDelete(false); }}
              className="text-xs text-gray-400"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Floor</label>
            <input
              type="text"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 3, Ground"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vibe</label>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(VIBE).map(([v, info]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(v as Vibe)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border-2 text-xs transition-colors ${
                    vibe === v ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <span>{info.emoji}</span>
                  <span className="text-gray-600 leading-tight">{info.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <span className="text-sm font-medium text-gray-700">Open to join</span>
            <button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${isOpen ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isOpen ? 'translate-x-5' : ''}`} />
            </button>
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

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Time from now</label>
            <div className="grid grid-cols-4 gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDurationMs(d.ms)}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                    durationMs === d.ms ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-white text-gray-600'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleEnd}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold"
            >
              End now
            </button>
          </div>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-xs text-red-400 hover:text-red-600"
            >
              Delete check-in
            </button>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-700 font-medium text-center">Delete this check-in?</p>
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
