'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { GroupWithMembers, Profile } from '@/lib/types';

export default function GroupsPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add-member search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  async function fetchGroups() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase
      .from('friend_groups')
      .select(
        `id, name, emoji, owner_id,
         friend_group_members (user_id, profiles:user_id (id, username, display_name, avatar_url))`
      )
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });

    setGroups((data as unknown as GroupWithMembers[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchGroups(); }, []);

  async function searchUsers(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${q.trim()}%`)
      .neq('id', currentUserId)
      .limit(5);
    setSearchResults((data as Profile[]) ?? []);
  }

  async function addMember(groupId: string, userId: string) {
    await supabase.from('friend_group_members').upsert(
      { group_id: groupId, user_id: userId, added_by: currentUserId },
      { onConflict: 'group_id,user_id' }
    );
    setSearchQuery('');
    setSearchResults([]);
    fetchGroups();
  }

  async function removeMember(groupId: string, userId: string) {
    await supabase
      .from('friend_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .neq('user_id', currentUserId); // can't remove yourself (owner)
    fetchGroups();
  }

  async function deleteGroup(groupId: string) {
    if (!confirm('Delete this group?')) return;
    await supabase.from('friend_groups').delete().eq('id', groupId);
    fetchGroups();
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
        <Link
          href="/groups/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
        >
          + New group
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">👥</p>
          <p className="text-gray-700 font-semibold text-lg">No groups yet</p>
          <p className="text-gray-400 text-sm mt-1">Create a group and add your friends</p>
          <Link href="/groups/new" className="inline-block mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm">
            Create a group
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedId === group.id;
            const members = group.friend_group_members ?? [];
            // Exclude owner from member display (owner is auto-added as member)
            const nonOwnerMembers = members.filter((m) => m.user_id !== currentUserId);

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
                    {/* Member list */}
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

                    {/* Add member search */}
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => searchUsers(e.target.value)}
                        placeholder="Add by username…"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                      {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10">
                          {searchResults.map((p) => (
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
    </div>
  );
}
