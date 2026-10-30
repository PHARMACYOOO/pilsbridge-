"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAreas } from "@/lib/delivery";
import { field, primary, useList } from "./shared";

type Pharmacy = { id: string; name: string; area: string; address: string; status: string; coldChain: boolean; lat: number | null; lng: number | null; phone: string | null };

/** "6.5095, 3.3711" (as copied from Google Maps) → numbers. */
function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

export default function Pharmacies() {
  const { items: pharmacies, error, setError, load } = useList<Pharmacy>("/admin/pharmacies");
  const areas = useAreas();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(p: Pharmacy) {
    const coords = parseCoords(drafts[p.id] ?? "");
    if (!coords) {
      setError("Paste coordinates like 6.5095, 3.3711 — or choose an area to fill them in.");
      return;
    }
    setBusy(p.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/admin/pharmacies/${p.id}/location`, { method: "PUT", body: coords });
      setNotice(`${p.name} placed on the map`);
      setDrafts((d) => ({ ...d, [p.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8">
      <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-stone">
        Each pharmacy needs its location so customers are matched to the nearest one, get an accurate delivery time, and nearby
        riders see its jobs. In Google Maps, right-click the pharmacy and click the coordinates to copy them, then paste here.
      </p>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
      <div className="mt-4 space-y-2">
        {pharmacies === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
        {pharmacies?.map((p) => (
          <div key={p.id} className="grid gap-3 border border-line bg-coal p-4 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                {p.name}
                {p.status !== "VERIFIED" && <Badge tone="warn">{p.status.replace("_", " ").toLowerCase()}</Badge>}
              </p>
              <p className="text-[12.5px] text-mute">{p.address}</p>
              <p className={`mt-1 flex items-center gap-1.5 font-mono text-[11.5px] ${p.lat != null ? "text-stone" : "text-warn"}`}>
                <MapPin className="h-3 w-3" />
                {p.lat != null && p.lng != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : "Not set — left out of delivery-time ranking"}
              </p>
              <PhoneField pharmacy={p} onSaved={load} onError={setError} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                value=""
                onChange={(e) => {
                  const a = areas.find((x) => x.key === e.target.value);
                  if (a) setDrafts((d) => ({ ...d, [p.id]: `${a.lat}, ${a.lng}` }));
                }}
                className={`${field} bg-coal`}
                aria-label="Fill from area"
              >
                <option value="">Fill from area (approx.)…</option>
                {areas.map((a) => (
                  <option key={a.key} value={a.key}>{a.name}</option>
                ))}
              </select>
              <input
                value={drafts[p.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                placeholder="6.5095, 3.3711"
                className={field}
                aria-label="Coordinates"
              />
              <button disabled={busy === p.id || !(drafts[p.id] ?? "").trim()} onClick={() => save(p)} className={primary}>
                {busy === p.id ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Counter phone couriers call at pickup — required for booking through a courier's API. */
function PhoneField({ pharmacy, onSaved, onError }: { pharmacy: Pharmacy; onSaved: () => Promise<void>; onError: (e: string | null) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        onError(null);
        try {
          await api(`/admin/pharmacies/${pharmacy.id}/phone`, { method: "PUT", body: { phone: value } });
          setValue("");
          await onSaved();
        } catch (err) {
          onError(err instanceof ApiError ? err.message : "Couldn’t save the phone number.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className={`font-mono text-[11.5px] ${pharmacy.phone ? "text-stone" : "text-warn"}`}>{pharmacy.phone ?? "No counter phone — couriers can’t be booked"}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={pharmacy.phone ? "Change" : "0803 000 0000"} inputMode="tel" className="h-8 w-36 border border-line bg-transparent px-2 text-[12.5px] text-bone placeholder:text-mute focus:border-gold focus:outline-none" />
      <button disabled={busy || value.trim().length < 10} className="text-[12.5px] text-gold hover:text-gold-soft disabled:opacity-40">Save</button>
    </form>
  );
}
