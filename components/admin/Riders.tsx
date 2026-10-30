"use client";

import { useState } from "react";
import { RotateCw, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { btn, field, ghost, label, primary, useList } from "./shared";

type Rider = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  partner: string | null;
  coldChain: boolean;
  active: boolean;
  online: boolean;
  area: string | null;
  activeJobs: number;
  delivered: number;
  failed: number;
};
export default function Riders() {
  const { items: riders, error, setError, load } = useList<Rider>("/admin/riders");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", partner: "", coldChain: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const canAdd = form.firstName.trim() && form.lastName.trim() && form.phone.trim() && form.partner.trim().length >= 2;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
      <section>
        <div className="flex items-center justify-between">
          <p className="eyebrow text-gold">Riders {riders && <span className="text-mute">· {riders.length}</span>}</p>
          <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
        {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
        <div className="mt-3 space-y-2">
          {riders === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
          {riders?.length === 0 && <p className="text-[13px] text-mute">No riders yet — add your logistics partners’ riders here.</p>}
          {riders?.map((r) => (
            <div key={r.id} className="grid gap-3 border border-line bg-coal p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                  {r.firstName} {r.lastName}
                  {r.coldChain && <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> Cold box</Badge>}
                  {!r.active ? <Badge tone="alert">Paused</Badge> : r.online ? <Badge tone="ok">Online{r.area ? ` · ${r.area}` : ""}</Badge> : <Badge tone="neutral">Offline</Badge>}
                </p>
                <p className="mt-1 font-mono text-[11.5px] text-mute">
                  {r.partner} · {r.phone} · {r.activeJobs} on the go · {r.delivered} delivered · {r.failed} failed
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!!busy}
                  onClick={() => act(`c-${r.id}`, () => api(`/admin/riders/${r.id}`, { method: "PATCH", body: { coldChain: !r.coldChain } }))}
                  className={ghost}
                >
                  {r.coldChain ? "No cold box" : "Has cold box"}
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    act(`a-${r.id}`, () => api(`/admin/riders/${r.id}`, { method: "PATCH", body: { active: !r.active } }), r.active ? `${r.firstName} paused` : `${r.firstName} reactivated`)
                  }
                  className={r.active ? `${btn} border border-alert/40 text-alert hover:border-alert` : primary}
                >
                  {r.active ? "Pause" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="eyebrow text-gold">Add a rider</p>
        <form
          className="mt-3 space-y-3 border border-line bg-coal p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(
              "add",
              () => api("/admin/riders", { method: "POST", body: { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), partner: form.partner.trim() } }),
              `${form.firstName.trim()} added — they sign in at /rider with ${form.phone.trim()}`,
            );
            if (ok) setForm({ firstName: "", lastName: "", phone: "", partner: form.partner, coldChain: false });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>First name</span>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={`${field} mt-2`} />
            </label>
            <label className="block">
              <span className={label}>Last name</span>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={`${field} mt-2`} />
            </label>
          </div>
          <label className="block">
            <span className={label}>Phone (their own number)</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0803 123 4567" inputMode="tel" className={`${field} mt-2`} />
          </label>
          <label className="block">
            <span className={label}>Logistics partner</span>
            <input value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })} placeholder="Company name" className={`${field} mt-2`} />
          </label>
          <label className="flex items-center gap-3 text-[13px] text-stone">
            <input type="checkbox" checked={form.coldChain} onChange={() => setForm({ ...form, coldChain: !form.coldChain })} className="h-4 w-4 accent-[var(--color-gold)]" />
            Carries a validated cold box (can take insulin and other 2–8 °C jobs)
          </label>
          <button disabled={!canAdd || busy === "add"} className={`${primary} w-full`}>
            {busy === "add" ? "Adding…" : "Add rider"}
          </button>
          <p className="text-[12px] leading-relaxed text-mute">Only add riders your partner has identity-checked. They sign in at /rider with a code sent to this number.</p>
        </form>
      </section>
    </div>
  );
}

