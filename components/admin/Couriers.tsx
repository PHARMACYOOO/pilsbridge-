"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { field, ghost, label, primary, useList } from "./shared";

export type Courier = {
  id: string;
  name: string;
  contact: string | null;
  acceptsPrescription: boolean;
  acceptsColdChain: boolean;
  approvalNote: string | null;
  active: boolean;
  api: string | null;
  priority: number;
  _count: { deliveries: number };
};
type CourierApiOption = { key: string; label: string; configured: boolean };

/** Courier companies we book with, and what each has accepted in writing. */
export default function Couriers() {
  const { items: couriers, error, setError, load } = useList<Courier>("/admin/couriers");
  const { items: apis } = useList<CourierApiOption>("/admin/couriers/apis");
  const [form, setForm] = useState({ name: "", contact: "", approvalNote: "", acceptsPrescription: false, acceptsColdChain: false });
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }
  const patch = (c: Courier, body: Partial<Courier>) => act(c.id, () => api(`/admin/couriers/${c.id}`, { method: "PATCH", body }));

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
      <section>
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-stone">
          Only tick what a courier has confirmed <strong className="text-bone">in writing</strong>, and note where that is. Bookings are blocked for
          prescription-only or cold-chain parcels unless the courier is approved for them.
        </p>
        {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
        <div className="mt-4 space-y-2">
          {couriers === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
          {couriers?.length === 0 && <p className="text-[13px] text-mute">No couriers yet — add the first one once they’ve replied to your outreach.</p>}
          {couriers?.map((c) => (
            <div key={c.id} className="border border-line bg-coal p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-[15px] text-bone">
                    {c.name} {!c.active && <Badge tone="alert">Not in use</Badge>}
                  </p>
                  <p className="font-mono text-[11.5px] text-mute">{c.contact ?? "No contact"} · {c._count.deliveries} bookings</p>
                  {c.approvalNote && <p className="mt-1 text-[12.5px] text-stone">Approval: {c.approvalNote}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="text-mute">Booking:</span>
                    <select
                      value={c.api ?? ""}
                      disabled={busy === c.id}
                      onChange={(e) => patch(c, { api: e.target.value || null })}
                      className="h-8 border border-line bg-coal px-2 text-[12.5px] text-bone focus:border-gold focus:outline-none"
                    >
                      <option value="">By hand on their dashboard</option>
                      {(apis ?? []).map((a) => (
                        <option key={a.key} value={a.key}>Through the {a.label} API</option>
                      ))}
                    </select>
                    {c.api && (() => {
                      const a = apis?.find((x) => x.key === c.api);
                      return a?.configured ? <Badge tone="ok">API key set</Badge> : <Badge tone="warn">API key missing on the server</Badge>;
                    })()}
                    <span className="text-mute">Priority</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      defaultValue={c.priority}
                      onBlur={(e) => Number(e.target.value) !== c.priority && Number(e.target.value) >= 1 && patch(c, { priority: Number(e.target.value) })}
                      className="h-8 w-16 border border-line bg-transparent px-2 text-[12.5px] text-bone focus:border-gold focus:outline-none"
                      title="Lower numbers are tried first"
                    />
                  </div>
                </div>
                <button disabled={busy === c.id} onClick={() => patch(c, { active: !c.active })} className={ghost}>
                  {c.active ? "Stop using" : "Use again"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-stone">
                {(
                  [
                    ["acceptsPrescription", "Prescription-only parcels"],
                    ["acceptsColdChain", "Cold chain (2–8 °C)"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c[k]}
                      disabled={busy === c.id}
                      onChange={() => {
                        const note = window.prompt(`Where is the written approval for "${l}"? (e.g. email from ops, date)`, c.approvalNote ?? "");
                        if (note !== null) patch(c, { [k]: !c[k], ...(note.trim() ? { approvalNote: note.trim() } : {}) });
                      }}
                      className="h-4 w-4 accent-[var(--color-gold)]"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow text-gold">Add a courier</p>
        <form
          className="mt-3 space-y-3 border border-line bg-coal p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { ...form, name: form.name.trim(), ...(form.contact.trim() ? { contact: form.contact.trim() } : { contact: undefined }), ...(form.approvalNote.trim() ? { approvalNote: form.approvalNote.trim() } : { approvalNote: undefined }) };
            if (await act("add", () => api("/admin/couriers", { method: "POST", body }))) {
              setForm({ name: "", contact: "", approvalNote: "", acceptsPrescription: false, acceptsColdChain: false });
            }
          }}
        >
          <label className="block">
            <span className={label}>Company</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chowdeck Relay" className={`${field} mt-2`} />
          </label>
          <label className="block">
            <span className={label}>Dispatch contact</span>
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone or email" className={`${field} mt-2`} />
          </label>
          <label className="block">
            <span className={label}>Written approval (where it is)</span>
            <input value={form.approvalNote} onChange={(e) => setForm({ ...form, approvalNote: e.target.value })} placeholder="e.g. Email from Relay ops, 12 Oct" className={`${field} mt-2`} />
          </label>
          <label className="flex items-center gap-3 text-[13px] text-stone">
            <input type="checkbox" checked={form.acceptsPrescription} onChange={() => setForm({ ...form, acceptsPrescription: !form.acceptsPrescription })} className="h-4 w-4 accent-[var(--color-gold)]" />
            Accepted prescription-only parcels in writing
          </label>
          <label className="flex items-center gap-3 text-[13px] text-stone">
            <input type="checkbox" checked={form.acceptsColdChain} onChange={() => setForm({ ...form, acceptsColdChain: !form.acceptsColdChain })} className="h-4 w-4 accent-[var(--color-gold)]" />
            Showed validated cold-chain capability
          </label>
          <button disabled={form.name.trim().length < 2 || busy === "add"} className={`${primary} w-full`}>{busy === "add" ? "Adding…" : "Add courier"}</button>
        </form>
      </section>
    </div>
  );
}
