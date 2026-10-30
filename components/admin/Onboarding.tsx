"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { danger, field, ghost, label, primary, shortDate, textarea, useAct, useList } from "./shared";

export type AdminPharmacy = {
  id: string;
  name: string;
  area: string;
  address: string;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "SUSPENDED";
  coldChain: boolean;
  phone: string | null;
  email: string | null;
  premisesLicenceNo: string;
  licenceExpiresAt: string;
  superintendentName: string | null;
  verifiedAt: string | null;
  suspendedReason: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankUpdatedAt: string | null;
  bankVerifiedAt: string | null;
  _count: { staff: number };
};

type Staff = { id: string; firstName: string | null; lastName: string | null; phone: string | null; role: string; pcnRegNo: string | null };

export const statusBadge: Record<AdminPharmacy["status"], [BadgeTone, string]> = {
  PENDING_VERIFICATION: ["warn", "Pending verification"],
  VERIFIED: ["ok", "Verified"],
  SUSPENDED: ["alert", "Suspended"],
};

/** Platform admin: add pharmacies, verify or suspend them, manage their staff and settlement account. */
export default function Onboarding() {
  const { items: pharmacies, error, setError, load } = useList<AdminPharmacy>("/admin/pharmacies");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | AdminPharmacy["status"]>("all");
  const list = pharmacies?.filter((p) => filter === "all" || p.status === filter);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {(["all", "PENDING_VERIFICATION", "VERIFIED", "SUSPENDED"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`border px-3 py-1.5 text-[12.5px] ${filter === f ? "border-gold text-gold-soft" : "border-line text-stone hover:text-bone"}`}>
              {f === "all" ? "All" : statusBadge[f][1]}
              <span className="ml-1.5 font-mono text-[10.5px] text-mute">{pharmacies?.filter((p) => f === "all" || p.status === f).length ?? ""}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
          <button onClick={() => setAdding((v) => !v)} className={primary}>{adding ? "Close" : "Add pharmacy"}</button>
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      {adding && (
        <div className="mt-4 max-w-[720px]">
          <NewPharmacyForm
            onCreated={async (id) => {
              setAdding(false);
              await load();
              setOpen(id);
            }}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {pharmacies === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
        {list?.map((p) => {
          const [tone, text] = statusBadge[p.status];
          const days = Math.ceil((new Date(p.licenceExpiresAt).getTime() - Date.now()) / 86_400_000);
          return (
            <div key={p.id} className="border border-line bg-coal">
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="grid w-full gap-2 p-4 text-left sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                    {p.name}
                    <Badge tone={tone}>{text}</Badge>
                    {p.bankAccountNumber && !p.bankVerifiedAt && <Badge tone="warn">Bank to verify</Badge>}
                  </span>
                  <span className="mt-1 block font-mono text-[11.5px] text-mute">
                    {p.area} · licence {p.premisesLicenceNo} · <span className={days <= 60 ? "text-warn" : ""}>expires {shortDate(p.licenceExpiresAt)}</span> · {p._count.staff} staff
                  </span>
                  {p.suspendedReason && p.status === "SUSPENDED" && <span className="mt-1 block text-[12.5px] text-alert">{p.suspendedReason}</span>}
                </span>
                <span className="font-mono text-[11px] text-gold">{open === p.id ? "Close" : "Manage"}</span>
              </button>
              {open === p.id && <PharmacyDetail id={p.id} onChanged={load} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PharmacyDetail({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const [p, setP] = useState<(AdminPharmacy & { staff: Staff[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setP(await api(`/admin/pharmacies/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t load the pharmacy.");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  const reload = useCallback(async () => {
    await load();
    await onChanged();
  }, [load, onChanged]);
  const { busy, notice, act } = useAct(setError, reload);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [bankNote, setBankNote] = useState("");
  const [staff, setStaff] = useState({ firstName: "", lastName: "", phone: "", role: "PHARMACIST", pcnRegNo: "" });

  if (!p) return <p className="border-t border-line-soft px-4 py-4 text-[13px] text-mute">{error ?? "Loading…"}</p>;
  const pharmacists = p.staff.filter((s) => s.role === "PHARMACIST").length;

  return (
    <div className="grid gap-6 border-t border-line-soft p-4 lg:grid-cols-2">
      <div className="space-y-5">
        {error && <p className="text-[13px] text-alert">{error}</p>}
        {notice && <p className="text-[13px] text-ok">{notice}</p>}
        <div className="text-[13px] text-stone">
          <p>{p.address}</p>
          <p className="mt-1 font-mono text-[11.5px] text-mute">
            Superintendent: {p.superintendentName ?? "—"} · {p.email ?? "no email"} · {p.phone ?? "no counter phone"} · {p.coldChain ? "cold chain" : "ambient only"}
          </p>
          {p.verifiedAt && <p className="mt-1 font-mono text-[11.5px] text-mute">Verified {shortDate(p.verifiedAt)}</p>}
        </div>

        {p.status !== "VERIFIED" && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("verify", () => api(`/admin/pharmacies/${id}/verify`, { method: "POST", body: { note: note.trim() } }), `${p.name} is live`)) setNote("");
            }}
          >
            <span className={label}>{p.status === "SUSPENDED" ? "Reinstate" : "Verify and go live"}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you checked, e.g. PCN premises licence on the PCN register, 23 Oct; CAC certificate seen" className={textarea} />
            {pharmacists === 0 && <p className="text-[12px] text-warn">Add the superintendent pharmacist first — a pharmacy needs a pharmacist to go live.</p>}
            <button disabled={!!busy || note.trim().length < 10 || pharmacists === 0} className={primary}>{busy === "verify" ? "Verifying…" : p.status === "SUSPENDED" ? "Reinstate" : "Verify"}</button>
          </form>
        )}
        {p.status !== "SUSPENDED" && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("suspend", () => api(`/admin/pharmacies/${id}/suspend`, { method: "POST", body: { reason: reason.trim() } }), `${p.name} suspended — it no longer appears to customers`)) setReason("");
            }}
          >
            <span className={label}>Suspend</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the pharmacy)" className={field} />
            <button disabled={!!busy || reason.trim().length < 5} className={danger}>Suspend</button>
          </form>
        )}

        <div className="space-y-2">
          <span className={label}>Settlement account</span>
          {p.bankAccountNumber ? (
            <p className="text-[13px] text-stone">
              {p.bankName} · {p.bankAccountName} · <span className="font-mono">{p.bankAccountNumber}</span>{" "}
              {p.bankVerifiedAt ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}
              <span className="block font-mono text-[11px] text-mute">Changed {shortDate(p.bankUpdatedAt)} · payouts wait 48 h after a change</span>
            </p>
          ) : (
            <p className="text-[13px] text-mute">Not added yet — a pharmacist adds it in the portal&apos;s Settings.</p>
          )}
          {p.bankAccountNumber && !p.bankVerifiedAt && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act("bank", () => api(`/admin/pharmacies/${id}/bank/verify`, { method: "POST", body: { note: bankNote.trim() } }), "Account verified")) setBankNote("");
              }}
            >
              <input value={bankNote} onChange={(e) => setBankNote(e.target.value)} placeholder="How you checked it (name matches CAC, confirmed by phone…)" className={field} />
              <button disabled={!!busy || bankNote.trim().length < 10} className={primary}>Verify</button>
            </form>
          )}
        </div>
      </div>

      <div>
        <span className={label}>Staff</span>
        <ul className="mt-2 divide-y divide-line-soft border border-line">
          {p.staff.length === 0 && <li className="px-3 py-3 text-[13px] text-mute">No staff yet.</li>}
          {p.staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              <span className="min-w-0">
                <span className="text-bone">{s.firstName} {s.lastName}</span>
                <span className="ml-2 font-mono text-[11px] text-mute">{s.role === "PHARMACIST" ? `Pharmacist ${s.pcnRegNo ?? ""}` : "Counter staff"} · {s.phone}</span>
              </span>
              <button
                disabled={!!busy}
                onClick={() => window.confirm(`Remove ${s.firstName} from ${p.name}? Their account becomes a plain patient account.`) && act(`rm-${s.id}`, () => api(`/admin/pharmacies/${id}/staff/${s.id}`, { method: "DELETE" }), "Removed")}
                className="text-[12px] text-alert hover:underline disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 grid grid-cols-2 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { firstName: staff.firstName.trim(), lastName: staff.lastName.trim(), phone: staff.phone.trim(), role: staff.role, ...(staff.role === "PHARMACIST" ? { pcnRegNo: staff.pcnRegNo.trim() } : {}) };
            if (await act("staff", () => api(`/admin/pharmacies/${id}/staff`, { method: "POST", body }), `${body.firstName} added — they sign in at /portal with ${body.phone}`)) {
              setStaff({ firstName: "", lastName: "", phone: "", role: staff.role, pcnRegNo: "" });
            }
          }}
        >
          <input value={staff.firstName} onChange={(e) => setStaff({ ...staff, firstName: e.target.value })} placeholder="First name" className={field} />
          <input value={staff.lastName} onChange={(e) => setStaff({ ...staff, lastName: e.target.value })} placeholder="Last name" className={field} />
          <input value={staff.phone} onChange={(e) => setStaff({ ...staff, phone: e.target.value })} placeholder="Their own phone" inputMode="tel" className={field} />
          <select value={staff.role} onChange={(e) => setStaff({ ...staff, role: e.target.value })} className={`${field} bg-coal`} aria-label="Role">
            <option value="PHARMACIST">Pharmacist</option>
            <option value="PHARMACY_STAFF">Counter staff</option>
          </select>
          {staff.role === "PHARMACIST" && <input value={staff.pcnRegNo} onChange={(e) => setStaff({ ...staff, pcnRegNo: e.target.value })} placeholder="PCN registration no." className={`${field} col-span-2`} />}
          <button
            disabled={!!busy || !staff.firstName.trim() || !staff.lastName.trim() || staff.phone.trim().length < 10 || (staff.role === "PHARMACIST" && staff.pcnRegNo.trim().length < 3)}
            className={`${ghost} col-span-2`}
          >
            {busy === "staff" ? "Adding…" : "Add staff member"}
          </button>
        </form>
      </div>
    </div>
  );
}

export type PharmacyDraft = { name: string; area: string; address: string; premisesLicenceNo: string; licenceExpiresAt: string; superintendentName: string; email: string; phone: string; coldChain: boolean };
const empty: PharmacyDraft = { name: "", area: "", address: "", premisesLicenceNo: "", licenceExpiresAt: "", superintendentName: "", email: "", phone: "", coldChain: false };

/** A new pharmacy, pending verification. Optionally from a partner application, which is then marked approved. */
export function NewPharmacyForm({ initial, applicationId, onCreated }: { initial?: Partial<PharmacyDraft>; applicationId?: string; onCreated: (id: string) => void }) {
  const [f, setF] = useState<PharmacyDraft>({ ...empty, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof PharmacyDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "coldChain" ? e.target.checked : e.target.value });
  const ok = f.name.trim().length >= 2 && f.area.trim().length >= 2 && f.address.trim().length >= 5 && f.premisesLicenceNo.trim().length >= 3 && f.licenceExpiresAt;

  return (
    <form
      className="grid grid-cols-2 gap-3 border border-line bg-coal p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const body = {
            name: f.name.trim(), area: f.area.trim(), address: f.address.trim(), premisesLicenceNo: f.premisesLicenceNo.trim(), licenceExpiresAt: f.licenceExpiresAt, coldChain: f.coldChain,
            ...(f.superintendentName.trim() ? { superintendentName: f.superintendentName.trim() } : {}),
            ...(f.email.trim() ? { email: f.email.trim() } : {}),
            ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
            ...(applicationId ? { applicationId } : {}),
          };
          const created = await api<{ id: string }>("/admin/pharmacies", { method: "POST", body });
          onCreated(created.id);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn’t add the pharmacy.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {([
        ["name", "Trading name", "col-span-2"],
        ["area", "Area (shown to customers)", ""],
        ["premisesLicenceNo", "PCN premises licence no.", ""],
        ["address", "Premises address", "col-span-2"],
        ["superintendentName", "Superintendent pharmacist", ""],
        ["licenceExpiresAt", "Licence expires", ""],
        ["email", "Email", ""],
        ["phone", "Counter phone", ""],
      ] as const).map(([k, l, span]) => (
        <label key={k} className={`block ${span}`}>
          <span className={label}>{l}</span>
          <input type={k === "licenceExpiresAt" ? "date" : "text"} value={f[k]} onChange={set(k)} className={`${field} mt-2 [color-scheme:dark]`} />
        </label>
      ))}
      <label className="col-span-2 flex items-center gap-3 text-[13px] text-stone">
        <input type="checkbox" checked={f.coldChain} onChange={set("coldChain")} className="h-4 w-4 accent-[var(--color-gold)]" />
        Validated 2–8 °C storage (evidence seen)
      </label>
      {error && <p className="col-span-2 text-[13px] text-alert">{error}</p>}
      <button disabled={busy || !ok} className={`${primary} col-span-2`}>{busy ? "Adding…" : "Add pharmacy (pending verification)"}</button>
      <p className="col-span-2 text-[12px] text-mute">It isn&apos;t listed until you verify it. Set its map location and counter phone under Pharmacy locations.</p>
    </form>
  );
}
