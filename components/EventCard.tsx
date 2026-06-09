import type { Hangout } from '@/lib/types';

function timeLeft(plannedAt: string) {
  const endsAt = new Date(plannedAt).getTime() + 2 * 60 * 60 * 1000;
  const mins = Math.floor((endsAt - Date.now()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
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
}: {
  hangout: Hangout;
  currentUserId: string;
}) {
  const left = timeLeft(hangout.planned_at);
  const goingCount = hangout.hangout_participants.filter((p) => p.status === 'going').length;
  const myRsvp = hangout.hangout_participants.find((p) => p.user_id === currentUserId);

  return (
    <div className="bg-indigo-50 rounded-2xl p-4 shadow-sm border border-indigo-100">
      <div className="flex gap-3">
        <Avatar name={hangout.profiles.display_name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-900 truncate">
              {hangout.profiles.display_name}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-200 text-indigo-700 flex-shrink-0">
              📅 Happening now
            </span>
          </div>

          <p className="text-sm font-medium text-gray-800 mt-0.5">{hangout.title}</p>

          {hangout.buildings && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              📍 {hangout.buildings.name}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">{goingCount} going</span>

            {myRsvp?.status === 'going' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                ✅ You&apos;re in
              </span>
            )}

            {left && (
              <span className="text-xs text-gray-400 ml-auto">{left}</span>
            )}
          </div>

          {hangout.note && (
            <p className="text-sm text-gray-500 mt-2 italic">&ldquo;{hangout.note}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
