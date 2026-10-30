"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Check, Crosshair, MapPin } from "lucide-react";
import { inLagos, useAreas, type Pin } from "@/lib/delivery";

// Leaflet needs the browser.
const PinMap = dynamic(() => import("./PinMap"), { ssr: false, loading: () => <div className="h-[240px] animate-pulse bg-char" /> });

const field =
  "mt-2 h-11 w-full border border-line bg-transparent px-3.5 text-[13.5px] text-bone placeholder:text-mute focus:border-gold focus:outline-none";

/**
 * Delivery area (nearest pharmacy, arrival time), street address, and an optional exact pin — which
 * lets a courier find the door and gives a live delivery price.
 */
export default function DeliverTo({
  area,
  onArea,
  address,
  onAddress,
  pin,
  onPin,
}: {
  area: string;
  onArea: (key: string) => void;
  address: string;
  onAddress: (v: string) => void;
  pin?: Pin | null;
  onPin?: (p: Pin | null) => void;
}) {
  const areas = useAreas();
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const centre = areas.find((a) => a.key === area) ?? { lat: 6.5244, lng: 3.3792 };

  function locate() {
    if (!navigator.geolocation || !onPin) return setProblem("Your browser can’t share its location — drop the pin on the map instead.");
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inLagos(p)) return setProblem("That location is outside Lagos — drop the pin on the map instead.");
        onPin(p);
        setMapOpen(true);
      },
      () => {
        setLocating(false);
        setProblem("Couldn’t get your location — drop the pin on the map instead.");
        setMapOpen(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <span className="eyebrow text-gold">Deliver to</span>
      <label className="mt-3 block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Area</span>
        <select value={area} onChange={(e) => onArea(e.target.value)} className={`${field} bg-coal`}>
          <option value="">Choose your area in Lagos…</option>
          {areas.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Street address</span>
        <input value={address} onChange={(e) => onAddress(e.target.value)} placeholder="House number, street, landmark" autoComplete="street-address" className={field} />
      </label>

      {onPin && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            {pin ? (
              <span className="flex items-center gap-1.5 text-ok"><Check className="h-3.5 w-3.5" /> Exact location pinned</span>
            ) : (
              <span className="text-mute">Pin your exact location (optional) — the rider finds you faster.</span>
            )}
            <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-1.5 text-gold hover:text-gold-soft disabled:opacity-50">
              <Crosshair className="h-3.5 w-3.5" /> {locating ? "Locating…" : "Use my location"}
            </button>
            <button type="button" onClick={() => setMapOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-gold hover:text-gold-soft">
              <MapPin className="h-3.5 w-3.5" /> {mapOpen ? "Hide map" : pin ? "Adjust pin" : "Drop a pin"}
            </button>
            {pin && (
              <button type="button" onClick={() => onPin(null)} className="text-mute hover:text-alert">Remove</button>
            )}
          </div>
          {problem && <p className="mt-1 text-[12.5px] text-warn">{problem}</p>}
          {mapOpen && (
            <div className="mt-2 border border-line">
              <PinMap center={centre} pin={pin ?? null} onPin={(p) => (inLagos(p) ? onPin(p) : setProblem("Please pin a location in Lagos."))} />
              <p className="px-3 py-2 text-[11.5px] text-mute">Tap the map or drag the dot to your door.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
