"use client";

import { useEffect, useState } from "react";
import { Copy, ShieldCheck, X } from "lucide-react";
import QRCode from "qrcode";
import { api, ApiError, type SignedIn } from "@/lib/api";

const input =
  "h-12 w-full border border-line bg-transparent px-4 font-mono text-[18px] tracking-[0.3em] text-bone placeholder:tracking-normal placeholder:text-mute focus:border-gold focus:outline-none";
const primary =
  "flex w-full items-center justify-center gap-2 rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-graphite disabled:text-mute";

/** "JBSWY3DPEHPK3PXP…" → "JBSW Y3DP EHPK …", easier to type into an app. */
const groups = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

/**
 * The second sign-in step for admins and pharmacists: a code from an authenticator app (Google
 * Authenticator, Microsoft Authenticator, 1Password…), set up the first time, or a recovery code.
 */
export default function MfaDialog({
  kind,
  mfaToken,
  onDone,
  onCancel,
}: {
  kind: "mfa_required" | "mfa_setup_required";
  mfaToken: string;
  onDone: (res: SignedIn) => void;
  onCancel: () => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SignedIn | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  // The QR code encodes the same otpauth:// link the authenticator app would open; drawn here, in the browser.
  useEffect(() => {
    if (!setup) return;
    let live = true;
    QRCode.toString(setup.otpauthUrl, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => live && setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [setup]);

  useEffect(() => {
    if (kind !== "mfa_setup_required") return;
    api<{ secret: string; otpauthUrl: string }>("/auth/mfa/setup", { method: "POST", body: { mfaToken }, auth: false })
      .then(setSetup)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t start the set-up — try signing in again."));
  }, [kind, mfaToken]);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SignedIn>("/auth/mfa/verify", { method: "POST", body: { mfaToken, code: code.trim() }, auth: false });
      // First time: show the recovery codes before going on.
      if (res.recoveryCodes?.length) setSaved(res);
      else onDone(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong — please try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const ready = recovery ? code.replace(/[^a-z0-9]/gi, "").length >= 8 : /^\d{6}$/.test(code);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm it’s you">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative max-h-[100dvh] w-full max-w-[440px] overflow-y-auto border border-line bg-coal p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold">
              <ShieldCheck className="h-3.5 w-3.5" /> Two-step sign-in
            </p>
            <p className="mt-2 font-display text-[26px] leading-tight text-ivory">
              {saved ? "Save your recovery codes" : kind === "mfa_setup_required" ? "Set up your authenticator app" : "Enter your authenticator code"}
            </p>
          </div>
          {!saved && (
            <button onClick={onCancel} className="p-1 text-stone hover:text-bone" aria-label="Cancel sign-in">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {saved ? (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-stone">
              If you lose your phone, each of these lets you sign in once. Keep them somewhere safe — they won&apos;t be shown again.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2 border border-line p-4 font-mono text-[14px] text-bone">
              {saved.recoveryCodes!.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(saved.recoveryCodes!.join("\n")).then(() => setCopied(true), () => {});
              }}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-gold hover:text-gold-soft"
            >
              <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy all"}
            </button>
            <button onClick={() => onDone(saved)} className={`${primary} mt-6`}>
              I&apos;ve saved them — continue
            </button>
          </>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !busy) verify();
            }}
          >
            {kind === "mfa_setup_required" && (
              <div className="space-y-3 text-[13px] leading-relaxed text-stone">
                <p>Admin and pharmacist accounts confirm every sign-in with an authenticator app, so a stolen SIM isn&apos;t enough to get in.</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator…).</li>
                  <li>Scan this QR code with it — or type the setup key, or open the link on your phone.</li>
                  <li>Enter the 6-digit code it shows.</li>
                </ol>
                {setup ? (
                  <div className="border border-line p-3">
                    {qr && (
                      <img src={qr} alt="QR code to add Pilbridge to your authenticator app" width={176} height={176} className="mx-auto mb-3 block h-44 w-44 bg-white p-1" />
                    )}
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Setup key</p>
                    <p className="mt-1 break-all font-mono text-[15px] text-bone">{groups(setup.secret)}</p>
                    <a href={setup.otpauthUrl} className="mt-2 inline-block font-mono text-[11px] text-gold hover:text-gold-soft">
                      Open in authenticator app →
                    </a>
                  </div>
                ) : (
                  !error && <p className="text-mute">Preparing your key…</p>
                )}
              </div>
            )}
            {kind === "mfa_required" && <p className="text-[13px] text-stone">Open your authenticator app and enter the 6-digit code for Pilbridge.</p>}

            <input
              value={code}
              onChange={(e) => setCode(recovery ? e.target.value.slice(0, 12) : e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode={recovery ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              placeholder={recovery ? "Recovery code, e.g. abcd-2345" : "123456"}
              aria-label={recovery ? "Recovery code" : "Authenticator code"}
              className={input}
            />
            {error && (
              <p className="text-[13px] text-alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={!ready || busy || (kind === "mfa_setup_required" && !setup)} className={primary}>
              {busy ? "Checking…" : "Confirm"}
            </button>
            {kind === "mfa_required" && (
              <button
                type="button"
                onClick={() => {
                  setRecovery((v) => !v);
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center font-mono text-[11px] text-mute hover:text-gold"
              >
                {recovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
