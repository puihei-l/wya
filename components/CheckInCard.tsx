'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { isGenericBuildingName } from '@/lib/gps';
import type { CheckIn, Vibe, Group, Profile } from '@/lib/types';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const VIBE: Record<string, { img: string; label: string; bg: string; text: string }> = {
  chilling:   { img: '/vibes/1.png', label: 'Chilling',   bg: 'bg-green-100',  text: 'text-green-700' },
  exercising: { img: '/vibes/2.png', label: 'Exercising', bg: 'bg-red-100',    text: 'text-red-700' },
  eating:     { img: '/vibes/3.png', label: 'Eating',     bg: 'bg-orange-100', text: 'text-orange-700' },
  studying:   { img: '/vibes/4.png', label: 'Studying',   bg: 'bg-amber-100',  text: 'text-amber-700' },
  gaming:     { img: '/vibes/5.png', label: 'Gaming',     bg: 'bg-purple-100', text: 'text-purple-700' },
  working:    { img: '/vibes/6.png', label: 'Working',    bg: 'bg-blue-100',   text: 'text-blue-700' },
};

const INDEFINITE = -1;
const FAR_FUTURE = '2099-12-31T23:59:59Z';

const DURATIONS = [
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1hr', ms: 60 * 60 * 1000 },
  { label: '2hr', ms: 2 * 60 * 60 * 1000 },
  { label: '4hr', ms: 4 * 60 * 60 * 1000 },
  { label: '∞', ms: INDEFINITE },
];

function isIndefinite(expires: string) {
  return new Date(expires).getFullYear() >= 2099;
}

function calcExpiresAt(startMs: number, durationMs: number): string {
  return durationMs === INDEFINITE ? FAR_FUTURE : new Date(startMs + durationMs).toISOString();
}

function timeAgo(date: string) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function timeLeft(expires: string) {
  if (isIndefinite(expires)) return null;
  const mins = Math.floor((new Date(expires).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

function timeUntil(startsAt: string) {
  const mins = Math.floor((new Date(startsAt).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowDatetimeLocal() {
  return toDatetimeLocal(new Date().toISOString());
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function AvatarGroup({ people }: { people: Pick<Profile, 'display_name'>[] }) {
  const shown = people.slice(0, 3);
  const overflow = people.length - 3;
  return (
    <div className="flex flex-shrink-0 self-start">
      {shown.map((p, i) => (
        <div
          key={i}
          className={`w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm border-2 border-white ${i > 0 ? '-ml-3' : ''}`}
        >
          {initials(p.display_name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="-ml-3 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs border-2 border-white">
          +{overflow}
        </div>
      )}
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
  const isUpcoming = !!checkIn.starts_at && new Date(checkIn.starts_at) > new Date();

  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [floor, setFloor] = useState(checkIn.floor ?? '');
  const [vibe, setVibe] = useState<Vibe>(checkIn.vibe);
  const [isOpen, setIsOpen] = useState(checkIn.is_open);
  const [note, setNote] = useState(checkIn.note ?? '');
  const [startsAt, setStartsAt] = useState(checkIn.starts_at ? toDatetimeLocal(checkIn.starts_at) : '');
  const [durationMs, setDurationMs] = useState(
    isIndefinite(checkIn.expires_at) ? INDEFINITE : 2 * 60 * 60 * 1000
  );
  const [saving, setSaving] = useState(false);
  const [arrivalConfirmed, setArrivalConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);

  const isParticipant = (checkIn.check_in_participants ?? []).some(
    (p) => p.user_id === currentUserId,
  );
  const allPeople = [
    checkIn.profiles,
    ...(checkIn.check_in_participants ?? []).map((p) => p.profiles),
  ];

  async function joinCheckIn() {
    setJoining(true);
    const supabase = createClient();
    await supabase
      .from('check_in_participants')
      .insert({ check_in_id: checkIn.id, user_id: currentUserId });
    setJoining(false);
    onUpdate?.();
  }

  async function leaveCheckIn() {
    const supabase = createClient();
    await supabase
      .from('check_in_participants')
      .delete()
      .eq('check_in_id', checkIn.id)
      .eq('user_id', currentUserId);
    onUpdate?.();
  }
  const [editGroups, setEditGroups] = useState<Group[]>([]);
  const [editSelectedGroups, setEditSelectedGroups] = useState<string[]>([]);
  const [editShareAll, setEditShareAll] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const vibeInfo = VIBE[checkIn.vibe] ?? VIBE.chilling;
  const left = timeLeft(checkIn.expires_at);
  const until = checkIn.starts_at ? timeUntil(checkIn.starts_at) : null;

  // Show arrival prompt if: owner, check-in just became active, has a planned pin and a building.
  const needsArrivalConfirm =
    isOwner &&
    !isUpcoming &&
    !arrivalConfirmed &&
    checkIn.planned_lat != null &&
    checkIn.planned_lng != null &&
    checkIn.buildings != null &&
    !isGenericBuildingName(checkIn.buildings.name) &&
    checkIn.starts_at != null &&
    Date.now() - new Date(checkIn.starts_at).getTime() < 4 * 60 * 60 * 1000;

  function confirmArrival() {
    setArrivalConfirmed(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const supabase = createClient();
        supabase.rpc('contribute_building_location', {
          p_building_id: checkIn.buildings!.id,
          p_lat: pos.coords.latitude,
          p_lng: pos.coords.longitude,
        }).then(() => {});
      },
      () => {},
      { timeout: 10000 },
    );
  }

  async function openEdit() {
    setIsEditing(true);
    setGroupsLoading(true);
    const supabase = createClient();
    const [{ data: groupsData }, { data: linkedData }] = await Promise.all([
      supabase.from('friend_groups').select('id, name, emoji, owner_id').eq('owner_id', checkIn.user_id),
      supabase.from('check_in_groups').select('group_id').eq('check_in_id', checkIn.id),
    ]);
    const available = (groupsData as unknown as Group[]) ?? [];
    const linked = ((linkedData ?? []) as { group_id: string }[]).map((r) => r.group_id);
    setEditGroups(available);
    setEditSelectedGroups(linked);
    setEditShareAll(available.length > 0 && available.every((g) => linked.includes(g.id)));
    setGroupsLoading(false);
  }

  async function handleSave() {
    const supabase = createClient();
    setSaving(true);
    const startMs = startsAt ? new Date(startsAt).getTime() : Date.now();
    await supabase
      .from('check_ins')
      .update({
        floor: floor.trim() || null,
        vibe,
        is_open: isOpen,
        note: note.trim() || null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        expires_at: calcExpiresAt(startMs, durationMs),
      })
      .eq('id', checkIn.id);
    const finalGroupIds = editShareAll ? editGroups.map((g) => g.id) : editSelectedGroups;
    await supabase.rpc('update_check_in_groups', {
      p_check_in_id: checkIn.id,
      p_group_ids: finalGroupIds,
    });
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

  const editingStartsAtIsFuture = startsAt && new Date(startsAt) > new Date();

  const cardBody = (
    <>
    <div className="flex gap-3">
      <AvatarGroup people={allPeople} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-gray-900 truncate">
            {checkIn.profiles.display_name}
            {(checkIn.check_in_participants ?? []).length > 0 && (
              <span className="font-normal text-gray-400 text-sm">
                {' '}+{(checkIn.check_in_participants ?? []).length}
              </span>
            )}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {isUpcoming && until
              ? until
              : timeAgo(
                  checkIn.starts_at && new Date(checkIn.starts_at) <= new Date()
                    ? checkIn.starts_at
                    : checkIn.created_at,
                )}
          </span>
        </div>
        <p className="text-sm text-gray-600 truncate mt-0.5">
          {checkIn.buildings?.name ?? checkIn.custom_location ?? 'Unknown location'}
          {checkIn.floor && <span className="text-gray-400"> · {checkIn.floor}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {isUpcoming ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
              📅 Heading there {until}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${vibeInfo.bg} ${vibeInfo.text}`}>
              <img src={vibeInfo.img} alt={vibeInfo.label} className="w-3.5 h-3.5 object-contain" />
              {vibeInfo.label}
            </span>
          )}
          {!isUpcoming && (
            checkIn.is_open ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                <img src="/unlock.png" alt="Open" className="w-3.5 h-3.5 object-contain" />
                Open to join
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <img src="/lock.png" alt="Not open" className="w-3.5 h-3.5 object-contain" />
                Not open
              </span>
            )
          )}
          {left && !isUpcoming && <span className="text-xs text-gray-400 ml-auto">{left}</span>}
        </div>
        {checkIn.note && (
          <p className="text-sm text-gray-500 mt-2 italic">&ldquo;{checkIn.note}&rdquo;</p>
        )}
      </div>
    </div>
    {checkIn.planned_lat != null && checkIn.planned_lng != null && (
      <div className="mt-3">
        <MapView
          lat={checkIn.planned_lat}
          lng={checkIn.planned_lng}
          initLat={checkIn.planned_lat}
          initLng={checkIn.planned_lng}
          height="128px"
        />
      </div>
    )}
    {needsArrivalConfirm && (
      <div className="mt-3 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
        <p className="text-xs text-indigo-700 font-medium">You&apos;re here now?</p>
        <button
          onClick={confirmArrival}
          className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg flex-shrink-0"
        >
          Confirm location
        </button>
      </div>
    )}
    </>
  );

  if (!isOwner) {
    const canJoin = checkIn.is_open && currentUserId && !isParticipant;
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        {cardBody}
        {canJoin && (
          <button
            onClick={joinCheckIn}
            disabled={joining}
            className="w-full py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {joining ? '…' : isUpcoming ? "I'm going" : "I'm here"}
          </button>
        )}
        {isParticipant && (
          <button
            onClick={leaveCheckIn}
            className="w-full py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold"
          >
            Leave
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {!isEditing ? (
        <button
          onClick={openEdit}
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
            <label className="block text-xs font-semibold text-gray-500 mb-1">Area</label>
            <input
              type="text"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="e.g. 3rd floor, Room 204, Rooftop"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vibe</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(VIBE).map(([v, info]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(v as Vibe)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border-2 text-xs transition-colors ${
                    vibe === v ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <img src={info.img} alt={info.label} className="w-6 h-6 object-contain" />
                  <span className="text-gray-600 leading-tight">{info.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <img src={isOpen ? '/unlock.png' : '/lock.png'} alt={isOpen ? 'Open' : 'Closed'} className="w-4 h-4 object-contain" />
              <span className="text-sm font-medium text-gray-700">{isOpen ? 'Open to join' : 'Not open'}</span>
            </div>
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
              placeholder="Add a comment…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Start time <span className="font-normal text-gray-400">(leave blank for now)</span>
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="datetime-local"
                value={startsAt}
                min={nowDatetimeLocal()}
                onChange={(e) => setStartsAt(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              {startsAt && (
                <button type="button" onClick={() => setStartsAt('')} className="text-xs text-gray-400 px-1">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Time from {editingStartsAtIsFuture ? 'start time' : 'now'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
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

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Visibility</label>
            {groupsLoading ? (
              <p className="text-xs text-gray-400 py-1">Loading…</p>
            ) : editGroups.length === 0 ? (
              <p className="text-xs text-gray-400">No groups yet</p>
            ) : (
              <div className="space-y-1.5">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer text-xs transition-colors ${editShareAll ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={editShareAll}
                    onChange={() => setEditShareAll((v) => !v)}
                  />
                  <span className="font-medium text-gray-900">All friends</span>
                  <span className="text-gray-400">({editGroups.length})</span>
                  {editShareAll && <span className="ml-auto text-indigo-600">✓</span>}
                </label>
                {!editShareAll && editGroups.map((g) => (
                  <label
                    key={g.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer text-xs transition-colors ${editSelectedGroups.includes(g.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={editSelectedGroups.includes(g.id)}
                      onChange={() =>
                        setEditSelectedGroups((prev) =>
                          prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                        )
                      }
                    />
                    <span className="text-base">{g.emoji}</span>
                    <span className="font-medium text-gray-700">{g.name}</span>
                    {editSelectedGroups.includes(g.id) && <span className="ml-auto text-indigo-600">✓</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!isUpcoming && (
              <button
                onClick={handleEnd}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold"
              >
                End now
              </button>
            )}
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
