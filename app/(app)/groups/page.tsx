'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { GroupWithMembers, Profile, FriendRequest } from '@/lib/types';

export default function GroupsPage() {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [requests, setRequests] = useState<FriendRequest[]>([]);

  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState<Profile[]>([]);
  const findTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [memberQuery, setMemberQuery] = useState<Record<string, string>>({});

  const incomingPending = requests.filter(
    (r) => r.to_id === currentUserId && r.status === 'pending'
  );
  const friends: Profile[] = requests
    .filter((r) => r.status === 'accepted')
    .map((r) => (r.from_id === currentUserId ? r.to_profile : r.from_profile));

  function getRequestInfo(userId: string) {
    const req = requests.find(
      (r) =>
        (r.from_id === currentUserId && r.to_id === userId) ||
        (r.to_id === currentUserId && r.from_id === userId)
    );
    if (!req) return null;
    return { ...req, direction: req.from_id === currentUserId ? 'outgoing' : 'incoming' };
  }

  async function fetchAll(uid?: string) {
    const id = uid ?? currentUserId;
    if (!id) return;

    const [{ data: groupsData }, { data: reqData }] = await Promise.all([
      supabase
        .from('friend_groups')
        .select(
          `id, name, emoji, owner_id,
           friend_group_members (user_id, profiles:user_id (id, username, display_name, avatar_url))`
        )
        .eq('owner_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('friend_requests')
        .select(
          `id, from_id, to_id, status, created_at,
           from_profile:from_id (id, username, display_name, avatar_url),
           to_profile:to_id (id, username, display_name, avatar_url)`
        )
        .or(`from_id.eq.${id},to_id.eq.${id}`),
    ]);

    setGroups((groupsData as unknown as GroupWithMembers[]) ?? []);
    setRequests((reqData as unknown as FriendRequest[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      fetchAll(user.id);
    }
    init();
  }, []);

  useEffect(() => {
    if (findTimeout.current) clearTimeout(findTimeout.current);
    if (!findQuery.trim() || !currentUserId) { setFindResults([]); return; }
    findTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${findQuery.trim()}%`)
        .neq('id', currentUserId)
        .limit(5);
      setFindResults((data as Profile[]) ?? []);
    }, 300);
  }, [findQuery, currentUserId]);

  async function sendRequest(toId: string) {
    const { data } = await supabase
      .from('friend_requests')
      .insert({ from_id: currentUserId, to_id: toId })
      .select(
        `id, from_id, to_id, status, created_at,
         from_profile:from_id (id, username, display_name, avatar_url),
         to_profile:to_id (id, username, display_name, avatar_url)`
      )
      .single();
    if (data) setRequests((prev) => [...prev, data as unknown as FriendRequest]);
  }

  async function respondToRequest(requestId: string, status: 'accepted' | 'declined') {
    await supabase.from('friend_requests').update({ status }).eq('id', requestId);
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status } : r)));
  }

  function memberResults(groupId: string): Profile[] {
    const q = memberQuery[groupId] ?? '';
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    return friends.filter(
      (f) =>
        f.username.toLowerCase().includes(lower) ||
        f.display_name.toLowerCase().includes(lower)
    );
  }

  async function addMember(groupId: string, userId: string) {
    await supabase
      .from('friend_group_members')
      .upsert({ group_id: groupId, user_id: userId, added_by: currentUserId }, { onConflict: 'group_id,user_id' });
    setMemberQuery((prev) => ({ ...prev, [groupId]: '' }));
    fetchAll();
  }

  async function removeMember(groupId: string, userId: string) {
    await supabase
      .from('friend_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .neq('user_id', currentUserId);
    fetchAll();
  }

  async function deleteGroup(groupId: string) {
    if (!confirm('Delete this group?')) return;
    await supabase.from('friend_groups').delete().eq('id', groupId);
    fetchAll();
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Friends</h1>

      {/* Incoming friend requests */}
      {incomingPending.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Friend requests · {incomingPending.length}
          </p>
          <div className="space-y-2">
            {incomingPending.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 bg-white rounded-2xl border border-indigo-100 px-4 py-3"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                  {req.from_profile.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{req.from_profile.display_name}</p>
                  <p className="text-xs text-gray-400">@{req.from_profile.username}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondToRequest(req.id, 'accepted')}
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondToRequest(req.id, 'declined')}
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg font-semibold"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Find friends */}
      <div className="mb-6">
        <button
          onClick={() => setShowFind((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm font-semibold text-gray-700"
        >
          <span>Find friends</span>
          <span className="text-gray-400 text-xs">{showFind ? '▲' : '▼'}</span>
        </button>

        {showFind && (
          <div className="mt-2">
            <input
              type="text"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Search by username…"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            {findResults.length > 0 && (
              <div className="mt-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {findResults.map((p) => {
                  const info = getRequestInfo(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                        {p.display_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{p.display_name}</p>
                        <p className="text-xs text-gray-400">@{p.username}</p>
                      </div>
                      {info?.status === 'accepted' ? (
                        <span className="text-xs text-green-600 font-medium flex-shrink-0">Friends ✓</span>
                      ) : info?.status === 'pending' && info.direction === 'outgoing' ? (
                        <span className="text-xs text-gray-400 flex-shrink-0">Pending</span>
                      ) : info?.status === 'pending' && info.direction === 'incoming' ? (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => respondToRequest(info.id, 'accepted')}
                            className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => respondToRequest(info.id, 'declined')}
                            className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-semibold"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => sendRequest(p.id)}
                          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold flex-shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Groups</p>
        <Link
          href="/groups/new"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
        >
          + New
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-4">👥</p>
          <p className="text-gray-700 font-semibold text-lg">No groups yet</p>
          <p className="text-gray-400 text-sm mt-1">Create a group and add your friends</p>
          <Link
            href="/groups/new"
            className="inline-block mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm"
          >
            Create a group
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedId === group.id;
            const nonOwnerMembers = (group.friend_group_members ?? []).filter(
              (m) => m.user_id !== currentUserId
            );
            const mQuery = memberQuery[group.id] ?? '';
            const mResults = memberResults(group.id);

            return (
              <div key={group.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <span className="text-2xl">{group.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{group.name}</p>
                    <p className="text-xs text-gray-400">
                      {nonOwnerMembers.length} {nonOwnerMembers.length === 1 ? 'friend' : 'friends'}
                    </p>
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    {nonOwnerMembers.length > 0 && (
                      <div className="mt-3 space-y-2 mb-4">
                        {nonOwnerMembers.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                              {m.profiles.display_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{m.profiles.display_name}</p>
                              <p className="text-xs text-gray-400">@{m.profiles.username}</p>
                            </div>
                            <button
                              onClick={() => removeMember(group.id, m.user_id)}
                              className="text-xs text-red-400 font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {friends.length > 0 ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={mQuery}
                          onChange={(e) =>
                            setMemberQuery((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                          placeholder="Add a friend to this group…"
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                        {mResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10">
                            {mResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => addMember(group.id, p.id)}
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                              >
                                <p className="text-sm font-medium text-gray-900">{p.display_name}</p>
                                <p className="text-xs text-gray-400">@{p.username}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 mt-3 italic">
                        Use{' '}
                        <button
                          onClick={() => { setShowFind(true); setExpandedId(null); }}
                          className="text-indigo-500 not-italic font-medium"
                        >
                          Find friends
                        </button>{' '}
                        above to add people to this group.
                      </p>
                    )}

                    <button
                      onClick={() => deleteGroup(group.id)}
                      className="mt-3 text-xs text-red-400 font-medium"
                    >
                      Delete group
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Friends list */}
      {friends.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Friends · {friends.length}
          </p>
          <div className="space-y-2">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                  {f.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{f.display_name}</p>
                  <p className="text-xs text-gray-400">@{f.username}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
