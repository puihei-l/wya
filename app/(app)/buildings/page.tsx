'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Building, BuildingEdit } from '@/lib/types';

export default function BuildingsPage() {
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [edits, setEdits] = useState<BuildingEdit[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  // Add-building form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // Propose-edit state
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [editField, setEditField] = useState<'name' | 'address'>('name');
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    fetchPendingEdits();
  }, []);

  const searchBuildings = useCallback(async (q: string) => {
    setLoading(true);
    const query_q = q.trim();
    const { data } = query_q
      ? await supabase.from('buildings').select('id, name, address').ilike('name', `%${query_q}%`).limit(20)
      : await supabase.from('buildings').select('id, name, address').order('name').limit(20);
    setBuildings((data as Building[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(() => searchBuildings(query), 300);
    return () => clearTimeout(t);
  }, [query, searchBuildings]);

  async function fetchPendingEdits() {
    const { data } = await supabase
      .from('building_edits')
      .select(
        `id, building_id, field, proposed_value, created_at,
         buildings:building_id (id, name, address),
         building_edit_votes (user_id)`
      )
      .order('created_at', { ascending: false })
      .limit(20);
    setEdits((data as unknown as BuildingEdit[]) ?? []);
  }

  async function addBuilding(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await supabase.from('buildings').insert({
      name: newName.trim(),
      address: newAddress.trim() || null,
      created_by: currentUserId,
    });
    setNewName('');
    setNewAddress('');
    setShowAdd(false);
    searchBuildings(query);
  }

  async function proposeEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBuilding || !editValue.trim()) return;

    // Find existing edit with same building/field/value
    const { data: existing } = await supabase
      .from('building_edits')
      .select('id, building_edit_votes(user_id)')
      .eq('building_id', editingBuilding.id)
      .eq('field', editField)
      .eq('proposed_value', editValue.trim())
      .maybeSingle();

    if (existing) {
      // Vote on existing proposal
      await supabase
        .from('building_edit_votes')
        .upsert({ edit_id: existing.id, user_id: currentUserId }, { onConflict: 'edit_id,user_id' });
    } else {
      // Create new proposal + first vote
      const { data: newEdit } = await supabase
        .from('building_edits')
        .insert({ building_id: editingBuilding.id, field: editField, proposed_value: editValue.trim() })
        .select('id')
        .single();
      if (newEdit) {
        await supabase.from('building_edit_votes').insert({ edit_id: newEdit.id, user_id: currentUserId });
      }
    }

    setEditingBuilding(null);
    setEditValue('');
    fetchPendingEdits();
  }

  async function voteOnEdit(editId: string) {
    await supabase
      .from('building_edit_votes')
      .upsert({ edit_id: editId, user_id: currentUserId }, { onConflict: 'edit_id,user_id' });
    fetchPendingEdits();
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Buildings</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold"
        >
          + Add
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addBuilding} className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Building name"
            required
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Address (optional)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold">
              Add building
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 text-gray-400 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search buildings…"
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white mb-4"
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {buildings.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">{b.name}</p>
                {b.address && <p className="text-xs text-gray-400">{b.address}</p>}
              </div>
              <button
                onClick={() => { setEditingBuilding(b); setEditField('name'); setEditValue(b.name); }}
                className="text-xs text-indigo-600 font-medium"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Propose edit modal */}
      {editingBuilding && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 px-4 pb-6">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5">
            <h2 className="font-bold text-gray-900 mb-1">Propose edit</h2>
            <p className="text-sm text-gray-400 mb-4">{editingBuilding.name}</p>
            <form onSubmit={proposeEdit} className="space-y-3">
              <div className="flex gap-2">
                {(['name', 'address'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setEditField(f); setEditValue(f === 'name' ? editingBuilding.name : editingBuilding.address ?? ''); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${editField === f ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-500'}`}
                  >
                    {f === 'name' ? 'Name' : 'Address'}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-400">3 votes from different users auto-approves the change.</p>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold">
                  Submit
                </button>
                <button type="button" onClick={() => setEditingBuilding(null)} className="px-4 text-gray-400 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending edits */}
      {edits.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pending edits
          </h2>
          <div className="space-y-2">
            {edits.map((edit) => {
              const votes = edit.building_edit_votes?.length ?? 0;
              const hasVoted = edit.building_edit_votes?.some((v) => v.user_id === currentUserId);
              return (
                <div key={edit.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                  <p className="text-xs text-gray-400">{edit.buildings?.name}</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    <span className="text-gray-400">{edit.field}: </span>
                    {edit.proposed_value}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{votes}/3 votes</span>
                    {!hasVoted && (
                      <button
                        onClick={() => voteOnEdit(edit.id)}
                        className="text-xs text-indigo-600 font-semibold"
                      >
                        Agree
                      </button>
                    )}
                    {hasVoted && <span className="text-xs text-green-600">✓ Voted</span>}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min((votes / 3) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
