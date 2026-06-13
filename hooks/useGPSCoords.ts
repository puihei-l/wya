'use client';

import { useState, useEffect, useCallback } from 'react';
import { GPS_SUGGESTIONS_KEY, type Coords } from '@/lib/gps';

// Module-level cache persists across component mounts within the same session.
let _cache: Coords | null = null;

export function useGPSCoords(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(_cache);

  const resolve = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(GPS_SUGGESTIONS_KEY) !== 'true') return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _cache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(_cache);
      },
      () => {},
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    resolve();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resolve();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [resolve]);

  return coords;
}
