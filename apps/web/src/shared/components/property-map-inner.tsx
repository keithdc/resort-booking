/**
 * @file apps/web/src/shared/components/property-map-inner.tsx
 * @shared Leaflet map canvas
 * @dependencies leaflet, react-leaflet
 */

'use client';

import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface PropertyMapInnerProps {
  latitude: number;
  longitude: number;
  label: string;
}

const pin = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/**
 * Client-only OSM tiles.
 */
export function PropertyMapInner({ latitude, longitude, label }: PropertyMapInnerProps): React.JSX.Element {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
      aria-label={label}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={pin} />
    </MapContainer>
  );
}
