"use client";

import { useCallback, useEffect, useState } from "react";
import { usePortal } from "@/components/portal/store";
import { Btn, Panel, PortalHeading } from "@/components/portal/ui";
import { Badge } from "@/components/ui";
import { api, ApiError, type ApiSettings, type ApiTeamMember } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fieldClass = "mt-2 h-10 w-full border-b border-line bg-transparent text-[14px] text-bone focus:border-gold focus:outline-none disabled:text-stone [color-scheme:dark]";
const roleLabel: Record<string, string> = { PHARMACIST: "Pharmacist", PHARMACY_STAFF: "Pharmacy staff" };

function Field({ label, value, onChange, type = "text", disabled, placeholder }: { label: string; value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled || !onChange} placeholder={placeholder} className={fieldClass} />
    </label>
  );
}

export default function SettingsView() {
  const { notify } = usePortal();
  const { user, signOutEverywhere } = useAuth();
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const pharmacist = user?.role === "PHARMACIST";
  const [s, setS] = useState<ApiSettings | null>(null);
  const [team, setTeam] = useState<ApiTeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Editable copies.
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState<number[]>([]);
  const [opensAt, setOpensAt] = useState("");
  const [lastOrderAt, setLastOrderAt] = useState("");
  const [coverage, setCoverage] = useState<string[]>([]);
  const [bank, setBank] = useState({ bankName: "", accountName: "", accountNumber: "" });

  const adopt = useCallback((x: ApiSettings) => {
    setS(x);
    setPhone(x.contact.phone ?? "");
    setEmail(x.contact.email ?? "");
    setOpen(x.hours.openDays);
    setOpensAt(x.hours.opensAt ?? "");
    setLastOrderAt(x.hours.lastOrderAt ?? "");
    setCoverage(x.coverageAreas);
  }, []);

  useEffect(() => {
    Promise.all([api<ApiSettings>("/pharmacy/settings"), api<ApiTeamMember[]>("/pharmacy/team")])
      .then(([x, t]) => {
        adopt(x);
        setTeam(t);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load settings."));
  }, [adopt]);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { openDays: open, coverageAreas: coverage };
      if (phone.trim() && phone.trim() !== (s?.contact.phone ?? "")) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();
      if (opensAt) body.opensAt = opensAt;
      if (lastOrderAt) body.lastOrderAt = lastOrderAt;
      adopt(await api<ApiSettings>("/pharmacy/settings", { method: "PATCH", body }));
      notify("Settings saved");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn’t save settings", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveBank() {
    setBusy(true);
    try {
      adopt(await api<ApiSettings>("/pharmacy/settings/bank", { method: "PUT", body: bank }));
      setBank({ bankName: "", accountName: "", accountNumber: "" });
      notify("Bank details saved — Pilbridge will verify them; payouts resume 48 hours after the change");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn’t save bank details", "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-[13px] text-alert">{error}</p>;
  if (!s) return <p className="text-[13px] text-mute">Loading settings…</p>;

  return (
    <>
      <PortalHeading eyebrow="Account" title="Settings">
        {pharmacist ? (
          <Btn variant="gold" onClick={save} disabled={busy}>Save changes</Btn>
        ) : (
          <span className="font-mono text-[11px] text-mute">Only pharmacists can change settings</span>
        )}
      </PortalHeading>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Pharmacy profile" action={<Badge tone={s.profile.status === "VERIFIED" ? "ok" : "warn"}>{s.profile.status.replace("_", " ").toLowerCase()}</Badge>}>
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Trading name" value={s.profile.name} /></div>
            <div className="sm:col-span-2"><Field label="Premises address" value={s.profile.address} /></div>
            <Field label="Counter phone" type="tel" value={phone} onChange={pharmacist ? setPhone : undefined} placeholder="0803 000 0000" />
            <Field label="Email" type="email" value={email} onChange={pharmacist ? setEmail : undefined} placeholder="orders@pharmacy.ng" />
            <Field label="Premises licence" value={s.profile.premisesLicenceNo} />
            <Field label="Superintendent" value={s.profile.superintendentName ?? "—"} />
            <p className="text-[12px] text-mute sm:col-span-2">The name, address and licence are verified — contact Pilbridge to change them, or upload a renewed licence under Compliance.</p>
          </div>
        </Panel>

        <Panel title="Delivery hours">
          <div className="p-5">
            <div className="flex flex-wrap gap-1.5">
              {days.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  disabled={!pharmacist}
                  onClick={() => toggle(open, setOpen, i + 1)}
                  className={`w-12 border py-2 text-[12.5px] transition-colors disabled:cursor-default ${open.includes(i + 1) ? "border-gold bg-gold text-ink" : "border-line text-stone hover:text-bone"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6">
              <Field label="Opens" type="time" value={opensAt} onChange={pharmacist ? setOpensAt : undefined} />
              <Field label="Last delivery order" type="time" value={lastOrderAt} onChange={pharmacist ? setLastOrderAt : undefined} />
            </div>
            <p className="mt-4 text-[12px] text-mute">Saved for your pharmacy; checkout doesn&apos;t enforce them yet. No days selected means hours aren&apos;t set.</p>
          </div>
        </Panel>

        <Panel title="Delivery coverage">
          <div className="p-5">
            <div className="flex flex-wrap gap-1.5">
              {s.areas.map((a) => (
                <button
                  type="button"
                  key={a.key}
                  disabled={!pharmacist}
                  onClick={() => toggle(coverage, setCoverage, a.key)}
                  className={`border px-3 py-1.5 text-[12.5px] transition-colors disabled:cursor-default ${coverage.includes(a.key) ? "border-gold/60 bg-gold-wash text-gold-soft" : "border-line text-mute hover:text-bone"}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-mute">
              {coverage.length ? "Customers outside these areas won’t be offered your pharmacy at checkout." : "No areas selected: you’re offered for every Pilbridge delivery area."}
            </p>
          </div>
        </Panel>

        <Panel title="Settlement account" action={s.bank.accountNumber ? <Badge tone={s.bank.verified ? "ok" : "warn"}>{s.bank.verified ? "Verified" : "Awaiting verification"}</Badge> : undefined}>
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <Field label="Bank" value={s.bank.bankName ?? "—"} />
            <Field label="Account" value={s.bank.accountNumber ? `${s.bank.accountName ?? ""} ${s.bank.accountNumber}` : "Not added"} />
            {pharmacist && (
              <>
                <Field label="New bank" value={bank.bankName} onChange={(v) => setBank({ ...bank, bankName: v })} placeholder="e.g. GTBank" />
                <Field label="Account name" value={bank.accountName} onChange={(v) => setBank({ ...bank, accountName: v })} placeholder="As registered with the bank" />
                <Field label="Account number" value={bank.accountNumber} onChange={(v) => setBank({ ...bank, accountNumber: v.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digits" />
                <div className="flex items-end">
                  <Btn onClick={saveBank} disabled={busy || bank.accountNumber.length !== 10 || bank.bankName.trim().length < 2 || bank.accountName.trim().length < 2}>
                    {s.bank.accountNumber ? "Change account" : "Add account"}
                  </Btn>
                </div>
              </>
            )}
            <p className="text-[12px] text-mute sm:col-span-2">
              New or changed bank details are verified by Pilbridge, and payouts wait 48 hours after any change. Every pharmacist is texted when they change.
            </p>
          </div>
        </Panel>

        <Panel title="Security">
          <div className="space-y-4 p-5">
            <p className="text-[13px] text-stone">
              {pharmacist
                ? "Your sign-ins are confirmed with your authenticator app. If you lose your phone, sign in with a recovery code, or ask Pilbridge to reset it."
                : "Signed in with a code sent to your phone. Sessions end after 12 hours."}
            </p>
            <div className="flex flex-wrap gap-2">
              {pharmacist && (
                <Btn
                  onClick={async () => {
                    try {
                      setRecovery((await api<{ recoveryCodes: string[] }>("/me/mfa/recovery-codes", { method: "POST" })).recoveryCodes);
                      notify("New recovery codes — the old ones no longer work");
                    } catch (e) {
                      notify(e instanceof ApiError ? e.message : "Couldn’t make new codes", "error");
                    }
                  }}
                >
                  New recovery codes
                </Btn>
              )}
              <Btn variant="danger" onClick={() => window.confirm("Sign out of Pilbridge on every device, this one included?") && signOutEverywhere().catch(() => notify("Couldn’t sign out everywhere — try again", "error"))}>
                Sign out everywhere
              </Btn>
            </div>
            {recovery && (
              <div>
                <p className="text-[12px] text-mute">Save these somewhere safe — each signs you in once, and they won&apos;t be shown again.</p>
                <ul className="mt-2 grid grid-cols-2 gap-2 border border-line p-3 font-mono text-[13px] text-bone sm:grid-cols-5">
                  {recovery.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Team & access" className="xl:col-span-2" action={<span className="font-mono text-[11px] text-mute">To add or remove someone, contact Pilbridge</span>}>
          <ul className="divide-y divide-line-soft">
            {team.map((m) => (
              <li key={m.id} className="grid gap-2 px-5 py-3.5 text-[13.5px] sm:grid-cols-[1fr_1fr_1.4fr] sm:items-center">
                <span className="text-bone">{[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}</span>
                <span className="text-stone">
                  {roleLabel[m.role] ?? m.role}
                  {m.pcnRegNo ? <span className="ml-2 font-mono text-[11px] text-mute">{m.pcnRegNo}</span> : null}
                </span>
                <span><Badge tone={m.role === "PHARMACIST" ? "pom" : "neutral"}>{m.role === "PHARMACIST" ? "Prescriptions, stock release, transfers, finance" : "Orders, inventory (no Rx approval)"}</Badge></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
