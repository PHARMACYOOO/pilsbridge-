"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, ApiError, type SignInResult } from "@/lib/api";
import { useAuth, type SocialProfile, type User } from "@/lib/auth";
import { loadScript } from "@/lib/load-script";

type Method = "google" | "apple";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";
const GOOGLE_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup"; auto_select?: boolean }) => void;
          renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
        signIn: () => Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
      };
    };
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

const label: Record<Method, string> = { google: "Google", apple: "Apple" };
const googleClass =
  "flex h-12 w-full items-center justify-center gap-3 rounded-[3px] border border-[#8e918f] bg-[#131314] text-[14px] font-medium text-[#e3e3e3] transition-colors hover:bg-[#1f1f20] disabled:opacity-60";
const appleClass =
  "flex h-12 w-full items-center justify-center gap-3 rounded-[3px] bg-white text-[14px] font-medium text-black transition-colors hover:bg-[#ececec] disabled:opacity-60";

/**
 * "Continue with Google / Apple", without leaving the page: Google's button and Apple's popup hand
 * back an ID token, which the API verifies and exchanges for a session. Anything on the page — a
 * basket, an uploaded prescription — survives. Providers without a client ID fall back to a
 * development-only demo account.
 *
 * `onSignedIn` gets the user; a new account still needs its name and consent (`profileComplete`).
 */
export default function SocialSignIn({ onSignedIn }: { onSignedIn?: (u: User) => void }) {
  const { adoptSignIn } = useAuth();
  const [demo, setDemo] = useState<Method | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function finish(method: Method, path: "/auth/social" | "/auth/social/demo", body: Record<string, string>) {
    setError(null);
    setBusy(method);
    try {
      const res = await api<SignInResult>(path, { method: "POST", body, auth: false });
      onSignedIn?.(await adoptSignIn(res));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? `${label[method]} sign-in isn’t set up yet — use your phone number for now.`
          : e instanceof ApiError
            ? e.message
            : `We couldn’t finish signing you in with ${label[method]}. Please try again.`,
      );
    } finally {
      setBusy(null);
    }
  }

  const names = (n?: { firstName?: string; lastName?: string }) => ({
    ...(n?.firstName ? { firstName: n.firstName } : {}),
    ...(n?.lastName ? { lastName: n.lastName } : {}),
  });

  return (
    <>
      <div className="grid gap-3">
        {GOOGLE_CLIENT_ID ? (
          <GoogleButton
            busy={busy === "google"}
            onToken={(idToken) => finish("google", "/auth/social", { provider: "GOOGLE", idToken })}
            onError={setError}
          />
        ) : (
          <button onClick={() => setDemo("google")} disabled={!!busy} className={googleClass}>
            <GoogleMark /> {busy === "google" ? "Signing in…" : "Continue with Google"}
          </button>
        )}
        {APPLE_CLIENT_ID && APPLE_REDIRECT_URI ? (
          <AppleButton
            busy={busy === "apple"}
            disabled={!!busy}
            onToken={(idToken, name) => finish("apple", "/auth/social", { provider: "APPLE", idToken, ...names(name) })}
            onError={setError}
          />
        ) : (
          <button onClick={() => setDemo("apple")} disabled={!!busy} className={appleClass}>
            <AppleMark /> {busy === "apple" ? "Signing in…" : "Continue with Apple"}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}

      {demo && (
        <DemoSheet
          method={demo}
          onClose={() => setDemo(null)}
          onContinue={(p) => {
            setDemo(null);
            finish(p.method, "/auth/social/demo", { provider: p.method.toUpperCase(), email: p.email, ...names(p) });
          }}
        />
      )}
    </>
  );
}

/** Google's own button (Google Identity Services, popup mode). Only Google's button can hand back an ID token. */
function GoogleButton({ busy, onToken, onError }: { busy: boolean; onToken: (idToken: string) => void; onError: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onToken);
  latest.current = onToken;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadScript(GOOGLE_SRC)
      .then(() => {
        const gsi = window.google?.accounts.id;
        const el = ref.current;
        if (!live || !gsi || !el) return;
        // The latest button on the page receives the token.
        gsi.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => latest.current(r.credential), ux_mode: "popup", auto_select: false });
        el.replaceChildren();
        gsi.renderButton(el, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.max(200, Math.min(400, el.offsetWidth)),
        });
        setReady(true);
      })
      .catch(() => live && onError("Couldn’t load Google sign-in — check your connection, or use your phone number."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-12 items-center justify-center">
      <div ref={ref} className={`flex w-full justify-center ${busy ? "pointer-events-none opacity-60" : ""}`} />
      {(!ready || busy) && (
        <span className={`${googleClass} pointer-events-none absolute inset-0`}>
          <GoogleMark /> {busy ? "Signing in…" : "Continue with Google"}
        </span>
      )}
    </div>
  );
}

/** Sign in with Apple JS in popup mode. The script loads ahead so the popup opens straight from the click. */
function AppleButton({
  busy,
  disabled,
  onToken,
  onError,
}: {
  busy: boolean;
  disabled: boolean;
  onToken: (idToken: string, name?: { firstName?: string; lastName?: string }) => void;
  onError: (msg: string) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadScript(APPLE_SRC)
      .then(() => {
        if (!live || !window.AppleID) return;
        window.AppleID.auth.init({ clientId: APPLE_CLIENT_ID, scope: "name email", redirectURI: APPLE_REDIRECT_URI, usePopup: true });
        setReady(true);
      })
      .catch(() => live && onError("Couldn’t load Apple sign-in — check your connection, or use your phone number."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (!window.AppleID) return;
    try {
      const res = await window.AppleID.auth.signIn();
      // Apple only sends the name the first time someone signs in to this app.
      onToken(res.authorization.id_token, res.user?.name);
    } catch (e) {
      const code = (e as { error?: string } | null)?.error;
      if (code === "popup_closed_by_user" || code === "user_cancelled_authorize") return;
      onError("We couldn’t finish signing you in with Apple. Please try again.");
    }
  }

  return (
    <button onClick={start} disabled={!ready || disabled} className={appleClass}>
      <AppleMark /> {busy ? "Signing in…" : "Continue with Apple"}
    </button>
  );
}

function DemoSheet({ method, onClose, onContinue }: { method: Method; onClose: () => void; onContinue: (p: SocialProfile) => void }) {
  const [name, setName] = useState("Ada Obi");
  const [email, setEmail] = useState(method === "google" ? "ada.obi@gmail.com" : "ada.obi@icloud.com");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${label[method]} sign-in (demo)`}>
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const [firstName, ...rest] = name.trim().split(/\s+/);
          onContinue({ firstName, lastName: rest.join(" "), email: email.trim(), method });
        }}
        className="relative w-full max-w-[420px] border border-line bg-coal p-6 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-warn">Demo mode</p>
            <p className="mt-2 font-display text-[26px] leading-tight text-ivory">{label[method]} sign-in isn&apos;t connected yet</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-stone hover:text-bone" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-stone">
          Set <span className="font-mono text-[12px] text-bone">NEXT_PUBLIC_{method.toUpperCase()}_CLIENT_ID</span> in{" "}
          <span className="font-mono text-[12px] text-bone">.env.local</span> (and the same ID in the API&apos;s{" "}
          <span className="font-mono text-[12px] text-bone">backend/.env</span>) to use real sign-in. For now, continue with a sample account
          (development only). Like the real thing, it needs no phone number and signs you straight in next time.
        </p>
        <div className="mt-5 space-y-4">
          {[
            ["Name", name, setName, "text"],
            ["Email", email, setEmail, "email"],
          ].map(([l, v, set, type]) => (
            <label key={l as string} className="block">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{l as string}</span>
              <input
                required
                type={type as string}
                value={v as string}
                onChange={(e) => (set as (s: string) => void)(e.target.value)}
                className="mt-2 h-11 w-full border border-line bg-transparent px-3.5 text-[14px] text-bone focus:border-gold focus:outline-none"
              />
            </label>
          ))}
        </div>
        <button className="mt-6 w-full rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink hover:bg-gold-soft">Continue</button>
      </form>
    </div>
  );
}
