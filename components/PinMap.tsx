"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type Pin = { lat: number; lng: number };

// A plain dot, so no marker image files are needed.
const dot = L.divIcon({
  className: "",
  html: '<span style="display:block;width:22px;height:22px;border-radius:50%;background:#c9a24a;border:3px solid #0d0d0c;box-shadow:0 0 0 2px #c9a24a"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function Follow({ center }: { center: Pin }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 15));
  }, [center.lat, center.lng, map]);
  return null;
}

function TapToPin({ onPin }: { onPin: (p: Pin) => void }) {
  useMapEvents({ click: (e) => onPin({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** OpenStreetMap with a draggable pin. Tap the map or drag the dot to the door. */
export default function PinMap({ center, pin, onPin }: { center: Pin; pin: Pin | null; onPin: (p: Pin) => void }) {
  const at = pin ?? center;
  return (
    <MapContainer center={[at.lat, at.lng]} zoom={15} scrollWheelZoom={false} style={{ height: 240, width: "100%" }} attributionControl>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <Follow center={at} />
      <TapToPin onPin={onPin} />
      {pin && (
        <Marker
          position={[pin.lat, pin.lng]}
          icon={dot}
          draggable
          eventHandlers={{ dragend: (e) => onPin((e.target as L.Marker).getLatLng()) }}
        />
      )}
    </MapContainer>
  );
}
