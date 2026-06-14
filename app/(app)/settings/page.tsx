'use client';

import { useState, useEffect } from 'react';
import { GPS_SUGGESTIONS_KEY, GPS_CONTRIBUTE_KEY } from '@/lib/gps';

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-200'} disabled:cursor-not-allowed`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [gpsSuggestions, setGpsSuggestions] = useState(false);
  const [gpsContribute, setGpsContribute] = useState(false);

  useEffect(() => {
    setGpsSuggestions(localStorage.getItem(GPS_SUGGESTIONS_KEY) === 'true');
    setGpsContribute(localStorage.getItem(GPS_CONTRIBUTE_KEY) === 'true');
  }, []);

  async function toggleSuggestions() {
    if (gpsSuggestions) {
      localStorage.setItem(GPS_SUGGESTIONS_KEY, 'false');
      localStorage.setItem(GPS_CONTRIBUTE_KEY, 'false');
      setGpsSuggestions(false);
      setGpsContribute(false);
      return;
    }

    if (!navigator.geolocation) return;

    // Request permission; if denied, stay off silently.
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          localStorage.setItem(GPS_SUGGESTIONS_KEY, 'true');
          setGpsSuggestions(true);
          resolve();
        },
        () => resolve(),
        { timeout: 10000 },
      );
    });
  }

  function toggleContribute() {
    if (!gpsSuggestions) return;
    const next = !gpsContribute;
    localStorage.setItem(GPS_CONTRIBUTE_KEY, String(next));
    setGpsContribute(next);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Location</p>

        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">Nearby suggestions</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              Rank buildings by distance when searching. Your location never leaves your device.
            </p>
          </div>
          <Toggle on={gpsSuggestions} onClick={toggleSuggestions} />
        </div>

        <div className={`bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-4 transition-opacity ${!gpsSuggestions ? 'opacity-50' : ''}`}>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">Improve location data</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              Share your coordinates when checking in to help pin buildings accurately. Requires nearby suggestions.
            </p>
          </div>
          <Toggle on={gpsContribute} onClick={toggleContribute} disabled={!gpsSuggestions} />
        </div>
      </div>
    </div>
  );
}
