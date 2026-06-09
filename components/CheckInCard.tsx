import type { CheckIn } from '@/lib/types';

const VIBE: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  studying: { emoji: '📚', label: 'Studying', bg: 'bg-amber-100', text: 'text-amber-700' },
  chilling: { emoji: '😌', label: 'Chilling', bg: 'bg-green-100', text: 'text-green-700' },
  eating: { emoji: '🍜', label: 'Eating', bg: 'bg-orange-100', text: 'text-orange-700' },
  working: { emoji: '💻', label: 'Working', bg: 'bg-blue-100', text: 'text-blue-700' },
  gaming: { emoji: '🎮', label: 'Gaming', bg: 'bg-purple-100', text: 'text-purple-700' },
};

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
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

export default function CheckInCard({ checkIn }: { checkIn: CheckIn }) {
  const vibe = VIBE[checkIn.vibe] ?? VIBE.chilling;
  const left = timeLeft(checkIn.expires_at);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex gap-3">
        <Avatar name={checkIn.profiles.display_name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-900 truncate">
              {checkIn.profiles.display_name}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {timeAgo(checkIn.created_at)}
            </span>
          </div>

          <p className="text-sm text-gray-600 truncate mt-0.5">
            {checkIn.buildings.name}
            {checkIn.floor && (
              <span className="text-gray-400"> · Floor {checkIn.floor}</span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${vibe.bg} ${vibe.text}`}
            >
              {vibe.emoji} {vibe.label}
            </span>

            {checkIn.is_open && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                ✌️ Open to join
              </span>
            )}

            {left && (
              <span className="text-xs text-gray-400 ml-auto">{left}</span>
            )}
          </div>

          {checkIn.note && (
            <p className="text-sm text-gray-500 mt-2 italic">&ldquo;{checkIn.note}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
