"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Navigation, Phone, RotateCw, Snowflake } from "lucide-react";
import PhoneSignIn from "./PhoneSignIn";
import { Badge } from "./ui";
import { api, ApiError, incidentLabel, type IncidentType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clock, useAreas } from "@/lib/delivery";

type Job = {
  code: string;
  status: "AWAITING_RIDER" | "ASSIGNED" | "PICKED_UP";
  coldChain: boolean;
  order: string;
  orderStatus: string;
  createdAt: string;
  arriveBy: string | null;
  toPickupKm?: number;
  pickup: { name: string; area: string; address: string };
  dropoff: { area: string | null; tripKm: number | null; address?: string; recipient?: string | null; phone?: string | null };
};
type Board = { rider: { partner: string; coldChain: boolean; online: boolean; area: string | null }; mine: Job[]; open: Job[] };

const REASONS: [string, string][] = [
  ["Customer not reachable", "CUSTOMER_UNAVAILABLE"],
  ["Wrong or incomplete address", "WRONG_ADDRESS"],
  ["Customer refused the parcel", "CUSTOMER_REFUSED"],
  ["Parcel seal damaged", "SAFETY"],
];
const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q}, Lagos`)}`;
const btn = "rounded-[3px] px-4 py-2.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-gold text-ink hover:bg-gold-soft`;
const ghost = `${btn} border border-line text-bone hover:border-gold`;

/** Courier app: go online in an area, take nearby jobs, collect, and hand over with the customer's code. */
export default function RiderClient() {
  const { user, ready, signOut } = useAuth();
  const areas = useAreas();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [area, setArea] = useState("");

  const load = useCallback(async () => {
    try {
      const b = await api<Board>("/rider/jobs");
      setBoard(b);
      if (b.rider.area) setArea(b.rider.area);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load jobs — check your connection.");
    }
  }, []);

  const isRider = user?.role === "RIDER";
  useEffect(() => {
    if (isRider) load();
  }, [isRider, load]);

  // Keep the job board fresh while online.
  useEffect(() => {
    if (!board?.rider.online) return;
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => window.clearInterval(t);
  }, [board?.rider.online, load]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const post = (path: string, body?: unknown) => api(path, { method: "POST", ...(body ? { body } : {}) });

  if (!ready) return <div className="h-[400px]" />;

  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-[32px] leading-none text-ivory">Rider sign in</h1>
        <p className="mb-6 mt-2 text-[13.5px] text-stone">Use the number your logistics partner registered with Pilbridge.</p>
        <PhoneSignIn intent="signin" skipProfile notFoundMessage="This number isn’t registered as a rider. Ask your logistics partner to add you." />
      </Shell>
    );
  }

  if (!isRider) {
    return (
      <Shell>
        <p className="text-[14px] text-stone">This page is for couriers. You’re signed in with a different kind of account.</p>
        <button onClick={signOut} className={`${ghost} mt-4`}>Sign out</button>
      </Shell>
    );
  }

  const online = !!board?.rider.online;
  return (
    <Shell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-gold">{board?.rider.partner ?? "Rider"}</p>
          <h1 className="mt-1 font-display text-[30px] leading-none text-ivory">Hi, {user.firstName ?? "rider"}</h1>
          {board?.rider.coldChain && (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-cold">
              <Snowflake className="h-3 w-3" /> Cold box — you also see cold-chain jobs
            </p>
          )}
        </div>
        <button onClick={load} className="p-2 text-mute hover:text-gold" aria-label="Refresh">
          <RotateCw className="h-4 w-4" />
        </button>
      </div>

      {/* Online / offline */}
      <div className="mt-6 border border-line bg-coal p-4">
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Where are you?</span>
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              if (online && e.target.value) act("status", () => api("/rider/status", { method: "PUT", body: { online: true, area: e.target.value } }));
            }}
            className="mt-2 h-11 w-full border border-line bg-coal px-3 text-[14px] text-bone focus:border-gold focus:outline-none"
          >
            <option value="">Choose your area…</option>
            {areas.map((a) => (
              <option key={a.key} value={a.key}>{a.name}</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy === "status" || (!online && !area)}
          onClick={() => act("status", () => api("/rider/status", { method: "PUT", body: online ? { online: false } : { online: true, area } }))}
          className={`${online ? ghost : primary} mt-3 w-full`}
        >
          {online ? "Go offline" : "Go online"}
        </button>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-mute">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-graphite"}`} />
          {online ? "Online — you’ll see jobs within 10 km" : "Offline — no new jobs"}
        </p>
      </div>

      {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}

      {/* My jobs */}
      {!!board?.mine.length && (
        <section className="mt-8">
          <p className="eyebrow text-gold">Your jobs</p>
          <div className="mt-3 space-y-3">
            {board.mine.map((j) => (
              <MyJob key={j.code} job={j} busy={busy} act={act} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* Open jobs */}
      <section className="mt-8">
        <p className="eyebrow text-gold">Jobs near you</p>
        {!online ? (
          <p className="mt-3 text-[13.5px] text-mute">Go online to see jobs.</p>
        ) : !board?.open.length ? (
          <p className="mt-3 text-[13.5px] text-mute">No jobs nearby right now — this list refreshes by itself.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {board.open.map((j) => (
              <div key={j.code} className="border border-line bg-coal p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] text-bone">{j.pickup.name}</p>
                    <p className="text-[12.5px] text-mute">{j.pickup.area} · {j.toPickupKm} km from you</p>
                  </div>
                  {j.coldChain && <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> Cold</Badge>}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[13px] text-stone">
                  <MapPin className="h-3.5 w-3.5 text-gold" /> To {j.dropoff.area ?? "—"}{j.dropoff.tripKm != null && ` · ${j.dropoff.tripKm} km trip`}
                </p>
                {j.arriveBy && <p className="mt-1 font-mono text-[11px] text-mute">Due by {clock(j.arriveBy)}</p>}
                <button disabled={!!busy} onClick={() => act(j.code, () => post(`/rider/jobs/${j.code}/accept`))} className={`${primary} mt-3 w-full`}>
                  {busy === j.code ? "Accepting…" : "Accept job"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

function MyJob({
  job: j,
  busy,
  act,
  post,
}: {
  job: Job;
  busy: string | null;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  post: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const [code, setCode] = useState("");
  const [failing, setFailing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [incident, setIncident] = useState<{ type: IncidentType; text: string }>({ type: "DAMAGED", text: "" });
  const collected = j.status === "PICKED_UP";
  const late = j.arriveBy && new Date(j.arriveBy).getTime() < Date.now();
  const where = collected ? j.dropoff.address ?? "" : j.pickup.address;

  return (
    <div className="border border-gold/40 bg-gold-wash p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] text-mute">Seal {j.code}</p>
        <Badge tone={collected ? "ok" : "neutral"}>{collected ? "On the way" : "Go to pharmacy"}</Badge>
      </div>
      {j.arriveBy && <p className={`mt-1 text-[12.5px] ${late ? "text-warn" : "text-stone"}`}>{late ? "Late — was due" : "Due"} by {clock(j.arriveBy)}</p>}

      {!collected ? (
        <>
          <p className="mt-3 text-[15px] text-bone">{j.pickup.name}</p>
          <p className="text-[13px] text-stone">{j.pickup.address}</p>
          <p className="mt-2 text-[12.5px] text-mute">
            {j.orderStatus === "READY" ? "Ready for collection." : "Being packed — head over now, it’ll be ready soon."}
          </p>
          <div className="mt-3 border border-gold/30 bg-ink/40 p-3 text-center">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Show this to the pharmacist</p>
            <p className="mt-1 font-mono text-[24px] tracking-[0.08em] text-ivory">{j.code}</p>
            <p className="mt-1 text-[12px] text-mute">They check it against the parcel label and hand it over. This page updates by itself.</p>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-[15px] text-bone">{j.dropoff.recipient ?? "Customer"}</p>
          <p className="text-[13px] text-stone">{j.dropoff.address}, {j.dropoff.area}</p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={maps(where)} target="_blank" rel="noreferrer" className={`${ghost} inline-flex items-center gap-1.5`}>
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
        {collected && j.dropoff.phone && (
          <a href={`tel:${j.dropoff.phone}`} className={`${ghost} inline-flex items-center gap-1.5`}>
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
      </div>

      {!collected ? (
        <button disabled={!!busy} onClick={() => act(`r-${j.code}`, () => post(`/rider/jobs/${j.code}/release`))} className={`${ghost} mt-4 w-full`}>
          Can’t make it — hand the job back
        </button>
      ) : failing ? (
        <div className="mt-4">
          <p className="text-[12.5px] text-stone">Why couldn’t you deliver? The parcel goes back to the pharmacy, still sealed.</p>
          <div className="mt-2 grid gap-2">
            {REASONS.map(([reason, cause]) => (
              <button key={cause} disabled={!!busy} onClick={() => act(`f-${j.code}`, () => post(`/rider/jobs/${j.code}/failed`, { reason, cause }))} className={`${ghost} text-left`}>
                {reason}
              </button>
            ))}
            <button onClick={() => setFailing(false)} className="text-[12.5px] text-mute hover:text-bone">Back</button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(`d-${j.code}`, () => post(`/rider/jobs/${j.code}/delivered`, { code }));
          }}
        >
          <label className="block">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Customer’s 4-digit code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="••••"
              className="mt-2 h-12 w-full border border-line bg-transparent text-center font-mono text-[24px] tracking-[0.5em] text-bone focus:border-gold focus:outline-none"
            />
          </label>
          <button disabled={!!busy || code.length !== 4} className={`${primary} mt-2 w-full`}>
            {busy === `d-${j.code}` ? "Checking…" : "Delivered"}
          </button>
          <button type="button" onClick={() => setFailing(true)} className="mt-2 w-full text-[12.5px] text-mute hover:text-alert">
            Couldn’t deliver
          </button>
        </form>
      )}
      {collected && (
        <div className="mt-3">
          {!reporting ? (
            <button onClick={() => setReporting(true)} className="w-full text-[12.5px] text-mute hover:text-alert">Report a problem with the parcel</button>
          ) : (
            <form
              className="space-y-2 border border-line bg-coal p-3"
              onSubmit={(e) => {
                e.preventDefault();
                act(`i-${j.code}`, () => post(`/rider/orders/${j.order}/incidents`, { type: incident.type, description: incident.text.trim() })).then(() => setReporting(false));
              }}
            >
              <select
                value={incident.type}
                onChange={(e) => setIncident({ ...incident, type: e.target.value as IncidentType })}
                className="h-10 w-full border border-line bg-coal px-3 text-[13px] text-bone focus:border-gold focus:outline-none"
              >
                {(["DAMAGED", "TAMPERED", "TEMPERATURE_EXCURSION", "LOST", "OTHER"] as IncidentType[]).map((t) => (
                  <option key={t} value={t}>{incidentLabel[t]}</option>
                ))}
              </select>
              <textarea
                value={incident.text}
                onChange={(e) => setIncident({ ...incident, text: e.target.value })}
                placeholder="What happened?"
                rows={2}
                className="w-full border border-line bg-transparent px-3 py-2 text-[13px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
              />
              <div className="flex gap-2">
                <button disabled={!!busy || incident.text.trim().length < 5} className={`${btn} flex-1 border border-alert/50 text-alert`}>Report</button>
                <button type="button" onClick={() => setReporting(false)} className={ghost}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[480px] px-4 pb-24 pt-8">{children}</div>;
}
