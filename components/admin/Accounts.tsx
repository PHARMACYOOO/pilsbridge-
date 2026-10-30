"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { api, ApiError, type Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { danger, field, ghost, primary, shortDate, useAct } from "./shared";

type Account = {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  pharmacy: { id: string; name: string } | null;
  disabledAt: string | null;
  disabledReason: string | null;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  mfaLockedUntil: string | null;
  activeSessions: number;
  createdAt: string;
};

const roleLabel: Record<Role, string> = { PATIENT: "Patient", PHARMACIST: "Pharmacist", PHARMACY_STAFF: "Pharmacy staff", PLATFORM_ADMIN: "Admin", RIDER: "Rider" };

/** Account security: find an account, disable it, sign it out everywhere, reset its authenticator, change a staff number. */
export default function Accounts() {
  const { user, signOutEverywhere } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | Role>("");
  const [items, setItems] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const search = async () => {
    const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(role ? { role } : {}) });
    try {
      setItems(await api<Account[]>(`/admin/users?${params}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t search accounts.");
    }
  };
  const { busy, notice, act } = useAct(setError, search);

  /** Every action here needs a reason for the audit trail. */
  const withReason = (key: string, prompt: string, fn: (reason: string) => Promise<unknown>, done: string) => {
    const reason = window.prompt(prompt);
    if (!reason) return;
    if (reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters — it goes in the audit log.");
      return;
    }
    act(key, () => fn(reason.trim()), done);
  };

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
      <section>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone, name or email" className={`${field} max-w-[320px]`} />
          <select value={role} onChange={(e) => setRole(e.target.value as "" | Role)} className={`${field} w-44 bg-coal`} aria-label="Role">
            <option value="">Any role</option>
            {(Object.keys(roleLabel) as Role[]).map((r) => (
              <option key={r} value={r}>{roleLabel[r]}</option>
            ))}
          </select>
          <button className={primary}>Search</button>
        </form>
        {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
        {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}

        <div className="mt-4 space-y-2">
          {items?.length === 0 && <p className="text-[13px] text-mute">No accounts found.</p>}
          {items?.map((a) => {
            const name = [a.firstName, a.lastName].filter(Boolean).join(" ") || "—";
            const self = a.id === user?.id;
            return (
              <div key={a.id} className="border border-line bg-coal p-4">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] text-bone">
                  {name}
                  <Badge tone="neutral">{roleLabel[a.role]}</Badge>
                  {a.disabledAt && <Badge tone="alert">Disabled</Badge>}
                  {a.mfaRequired && <Badge tone={a.mfaEnabled ? "ok" : "warn"}>{a.mfaEnabled ? "Authenticator on" : "Authenticator not set up"}</Badge>}
                  {a.mfaLockedUntil && new Date(a.mfaLockedUntil) > new Date() && <Badge tone="warn">Locked out</Badge>}
                  {self && <Badge tone="pom">You</Badge>}
                </p>
                <p className="mt-1 font-mono text-[11.5px] text-mute">
                  {a.phone ?? "no phone"} · {a.email ?? "no email"}
                  {a.pharmacy ? ` · ${a.pharmacy.name}` : ""} · joined {shortDate(a.createdAt)} · {a.activeSessions} signed-in device{a.activeSessions === 1 ? "" : "s"}
                </p>
                {a.disabledReason && <p className="mt-1 text-[12.5px] text-alert">{a.disabledReason}</p>}
                {!self && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.disabledAt ? (
                      <button disabled={!!busy} onClick={() => act(`en-${a.id}`, () => api(`/admin/users/${a.id}/enable`, { method: "POST" }), `${name} can sign in again`)} className={ghost}>
                        Re-enable
                      </button>
                    ) : (
                      <button
                        disabled={!!busy}
                        onClick={() => withReason(`dis-${a.id}`, `Disable ${name}? They're signed out everywhere and can't sign in. Reason:`, (reason) => api(`/admin/users/${a.id}/disable`, { method: "POST", body: { reason } }), `${name} disabled and signed out`)}
                        className={danger}
                      >
                        Disable
                      </button>
                    )}
                    <button
                      disabled={!!busy || a.activeSessions === 0}
                      onClick={() => withReason(`so-${a.id}`, `Sign ${name} out on every device? Reason:`, (reason) => api(`/admin/users/${a.id}/sessions/revoke`, { method: "POST", body: { reason } }), `${name} signed out everywhere`)}
                      className={ghost}
                    >
                      Sign out everywhere
                    </button>
                    {a.mfaEnabled && (
                      <button
                        disabled={!!busy}
                        onClick={() => withReason(`mfa-${a.id}`, `Reset ${name}'s authenticator app? Only do this after confirming who they are (e.g. a call). Reason:`, (reason) => api(`/admin/users/${a.id}/mfa/reset`, { method: "POST", body: { reason } }), `Authenticator reset — ${name} sets it up again at next sign-in`)}
                        className={ghost}
                      >
                        Reset authenticator
                      </button>
                    )}
                    {a.role !== "PATIENT" && (
                      <button
                        disabled={!!busy}
                        onClick={() => {
                          const phone = window.prompt(`New sign-in number for ${name}:`);
                          if (!phone) return;
                          withReason(`ph-${a.id}`, "Reason (how you confirmed the change):", (reason) => api(`/admin/users/${a.id}/phone`, { method: "PUT", body: { phone, reason } }), `${name}'s number changed — both numbers were texted`);
                        }}
                        className={ghost}
                      >
                        Change number
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow text-gold">Your account</p>
        <div className="mt-3 space-y-3 border border-line bg-coal p-5">
          <button
            onClick={() =>
              act("codes", async () => {
                setRecovery((await api<{ recoveryCodes: string[] }>("/me/mfa/recovery-codes", { method: "POST" })).recoveryCodes);
              }, "New recovery codes — the old ones no longer work")
            }
            disabled={!!busy}
            className={`${ghost} w-full`}
          >
            New recovery codes
          </button>
          {recovery && (
            <ul className="grid grid-cols-2 gap-2 border border-line p-3 font-mono text-[13px] text-bone">
              {recovery.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <button onClick={() => window.confirm("Sign out of Pilbridge on every device, this one included?") && signOutEverywhere()} className={`${danger} w-full`}>
            Sign out everywhere
          </button>
          <p className="text-[12px] leading-relaxed text-mute">Admins can&apos;t disable or reset their own account — another admin does that.</p>
        </div>
      </section>
    </div>
  );
}
