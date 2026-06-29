'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// divIcon avoids Next.js/webpack asset-URL issues with Leaflet's default marker images.
const PIN = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#4f46e5;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ClickLayer({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface MapViewProps {
  /** Current pin position */
  lat: number | null;
  lng: number | null;
  /** Where to centre the map on first mount */
  initLat: number;
  initLng: number;
  initZoom?: number;
  /** Omit for read-only display */
  onPick?: (lat: number, lng: number) => void;
  height?: string;
}

export default function MapView({
  lat,
  lng,
  initLat,
  initLng,
  initZoom = 16,
  onPick,
  height = '200px',
}: MapViewProps) {
  const interactive = !!onPick;

  return (
    <MapContainer
      center={[initLat, initLng]}
      zoom={initZoom}
      style={{ height, width: '100%', borderRadius: '12px', zIndex: 0 }}
      dragging={interactive}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      zoomControl={interactive}
      touchZoom={interactive}
      keyboard={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {interactive && onPick && <ClickLayer onPick={onPick} />}
      {lat != null && lng != null && <Marker position={[lat, lng]} icon={PIN} />}
    </MapContainer>
  );
}
