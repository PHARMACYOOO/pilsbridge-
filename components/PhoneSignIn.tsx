"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ApiError } from "@/lib/api";
import { maskPhone, normalisePhone, useAuth, type AuthIntent, type User } from "@/lib/auth";

type Step = "phone" | "code" | "details";

const input =
  "h-12 w-full border border-line bg-transparent px-4 text-[15px] text-bone placeholder:text-mute focus:border-gold focus:outline-none";
const primary =
  "flex w-full items-center justify-center gap-2 rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-graphite disabled:text-mute";
const label = "font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute";

type Problem = { text: string; switchTo?: "signin" | "signup" };

function problemOf(e: unknown, intent: AuthIntent, notFoundMessage?: string): Problem {
  if (!(e instanceof ApiError)) return { text: "Something went wrong — please try again." };
  if (e.status === 404 && intent === "signin") return { text: notFoundMessage ?? e.message, switchTo: notFoundMessage ? undefined : "signup" };
  if (e.status === 409 && intent === "signup" && /sign in/i.test(e.message)) return { text: e.message, switchTo: "signin" };
  return { text: e.message };
}

function Consent({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[12.5px] leading-relaxed text-stone">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-gold)]" />
      <span>
        I agree to the Terms and <Link href="/trust#privacy" className="text-gold hover:underline">Privacy Policy</Link>, and consent to
        Pilbridge and its partner pharmacies processing my health information to fulfil my orders.
      </span>
    </label>
  );
}

function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={label}>Phone number</span>
      <div className="mt-2 flex">
        <span className="flex h-12 shrink-0 items-center whitespace-nowrap border border-r-0 border-line bg-char px-3.5 font-mono text-[13px] text-stone">NG +234</span>
        <input type="tel" inputMode="tel" autoComplete="tel-national" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0803 123 4567" className={input} />
      </div>
    </label>
  );
}

/**
 * Phone + one-time code from the API, in three modes:
 *  - "signup": name, phone and consent first; the account is created complete when the code is verified.
 *  - "signin": phone, then code; numbers without an account are pointed to sign up.
 *  - "auto":   either — for quick checkout flows (a short name step follows for new numbers).
 */
export default function PhoneSignIn({
  onDone,
  intent = "auto",
  skipProfile = false,
  initialPhone = "",
  onSwitchIntent,
  notFoundMessage,
}: {
  onDone?: (u: User) => void;
  intent?: AuthIntent;
  /** Return straight after the code is verified, without the name/consent step (partner sign-in). */
  skipProfile?: boolean;
  initialPhone?: string;
  /** Offer to switch between sign in and create account when the number doesn't fit. */
  onSwitchIntent?: (intent: "signin" | "signup", phone: string) => void;
  /** Replaces "no account — create one" (e.g. on the partner tab, where staff can't self-register). */
  notFoundMessage?: string;
}) {
  const { user, requestCode, verifyCode, completeProfile } = useAuth();
  // Someone who verified their phone but didn't finish their profile picks up where they left off.
  const [step, setStep] = useState<Step>(user && !user.profileComplete ? "details" : "phone");
  const [raw, setRaw] = useState(initialPhone);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [first, setFirst] = useState(user?.firstName ?? "");
  const [last, setLast] = useState(user?.lastName ?? "");
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef<string | null>(null);
  const signingUp = intent === "signup";

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  // Submit as soon as all six digits are in (typed, pasted or filled from the SMS) — once per code.
  useEffect(() => {
    if (step === "code" && code.length === 6 && !busy && autoSubmitted.current !== code) {
      autoSubmitted.current = code;
      formRef.current?.requestSubmit();
    }
  }, [step, code, busy]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const p = normalisePhone(raw);
    if (!p) {
      setProblem({ text: "Enter a Nigerian mobile number, e.g. 0803 123 4567." });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const res = await requestCode(p, intent);
      setPhone(res.phone);
      setDevCode(res.devCode ?? null);
      setCode("");
      autoSubmitted.current = null;
      setStep("code");
      setResendIn(30);
    } catch (err) {
      setProblem(problemOf(err, intent, notFoundMessage));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setProblem({ text: "Enter the 6-digit code we sent you." });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const u = signingUp
        ? await verifyCode(phone, code, "signup", { firstName: first.trim(), lastName: last.trim(), consent: true })
        : await verifyCode(phone, code, intent);
      if (u.profileComplete || skipProfile) {
        onDone?.(u);
      } else {
        if (u.firstName) setFirst((f) => f || u.firstName!);
        if (u.lastName) setLast((l) => l || u.lastName!);
        setStep("details");
      }
    } catch (err) {
      setProblem(problemOf(err, intent, notFoundMessage));
    } finally {
      setBusy(false);
    }
  }

  async function finishProfile(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      // A verified Google/Apple email is already saved by the API when the account is created.
      onDone?.(await completeProfile({ firstName: first.trim(), lastName: last.trim() }));
    } catch (err) {
      setProblem(problemOf(err, intent));
    } finally {
      setBusy(false);
    }
  }

  const problemLine = problem && (
    <div className="space-y-2">
      <p className="text-[13px] text-alert">{problem.text}</p>
      {problem.switchTo && onSwitchIntent && (
        <button
          type="button"
          onClick={() => onSwitchIntent(problem.switchTo!, raw)}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-gold hover:text-gold-soft"
        >
          {problem.switchTo === "signup" ? "Create an account with this number" : "Sign in instead"} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        {signingUp && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>First name</span>
              <input required value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" className={`${input} mt-2`} />
            </label>
            <label className="block">
              <span className={label}>Last name</span>
              <input required value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" className={`${input} mt-2`} />
            </label>
          </div>
        )}
        <PhoneField value={raw} onChange={setRaw} />
        {signingUp && <Consent checked={consent} onChange={() => setConsent(!consent)} />}
        {problemLine}
        <button className={primary} disabled={busy || !raw.trim() || (signingUp && (!first.trim() || !last.trim() || !consent))}>
          {busy ? "Sending code…" : signingUp ? "Create account" : "Continue"} {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
        <p className="text-[12px] leading-relaxed text-mute">
          {intent === "signin"
            ? "We’ll text you a 6-digit code. No password needed."
            : signingUp
              ? "We’ll text you a 6-digit code to confirm the number is yours."
              : "We’ll text you a 6-digit code. No password needed — new numbers get an account automatically."}
        </p>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form ref={formRef} onSubmit={verify} className="space-y-4">
        <p className="text-[14px] text-stone">
          Code sent to <span className="text-bone">{maskPhone(phone)}</span> ·{" "}
          <button type="button" onClick={() => setStep("phone")} className="text-gold hover:text-gold-soft">Change</button>
        </p>
        <input
          ref={codeRef}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          aria-label="6-digit code"
          className={`${input} text-center font-mono text-[24px] tracking-[0.6em]`}
        />
        {problemLine}
        <button className={primary} disabled={busy || code.length !== 6}>{busy ? "Checking…" : signingUp ? "Verify & create account" : "Verify"}</button>
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          {devCode ? (
            <button type="button" onClick={() => setCode(devCode)} className="font-mono text-[10.5px] text-warn hover:underline">
              Dev mode — code {devCode} (tap to fill)
            </button>
          ) : (
            <span />
          )}
          <button type="button" disabled={resendIn > 0 || busy} onClick={() => sendCode()} className="text-gold hover:text-gold-soft disabled:text-mute">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={finishProfile} className="space-y-4">
      <p className="text-[14px] text-stone">{user?.phone ? "Almost done — just your name, then you’re in." : "Confirm your name as it should appear on prescriptions."}</p>
      <div className="grid grid-cols-2 gap-3">
        <input required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" autoComplete="given-name" className={input} />
        <input required value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" autoComplete="family-name" className={input} />
      </div>
      <Consent checked={consent} onChange={() => setConsent(!consent)} />
      {problemLine}
      <button className={primary} disabled={busy || !first.trim() || !last.trim() || !consent}>{busy ? "Saving…" : "Continue"}</button>
    </form>
  );
}
