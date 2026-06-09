'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const EMOJIS = ['👥', '🎓', '🏠', '🎮', '☕', '🍕', '🌙', '🏋️', '🎵', '📚', '🌿', '✨'];

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('friend_groups').insert({
      owner_id: user!.id,
      name: name.trim(),
      emoji,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/groups');
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <button onClick={() => router.back()} className="text-sm text-gray-400 mb-6 flex items-center gap-1">
        ← Back
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-6">New group</h1>

      <form onSubmit={handleCreate} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Emoji</label>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`aspect-square text-2xl rounded-xl flex items-center justify-center border-2 transition-colors ${
                  emoji === e ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Group name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Uni crew, Close friends"
            maxLength={40}
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base bg-white"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold disabled:opacity-40"
        >
          {loading ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  );
}
