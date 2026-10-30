"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import MfaDialog from "@/components/MfaDialog";
import { api, API_URL, ApiError, onSessionExpired, SESSION_EXPIRED_KEY, token, TOKEN_KEY, type ApiProfile, type MfaChallenge, type SignedIn, type SignInResult } from "./api";

/*
 * Session backed by the Pilbridge API. Phone + one-time code returns an access token; Google/Apple
 * sign-in is verified by the API and needs no phone number. Admins and pharmacists then confirm
 * with an authenticator app (MfaDialog) before they get a session. Signing out ends the session on
 * the server too.
 */

/** signin: existing accounts only · signup: new numbers only · auto: either (quick checkout flows). */
export type AuthIntent = "signin" | "signup" | "auto";

/** Sent with the code when signing up, so the account is created complete in one step. */
export type SignUpProfile = { firstName: string; lastName: string; email?: string; consent: true };

export type User = ApiProfile;

/** A sample profile from the demo Google/Apple step, used in development when real sign-in isn't configured. */
export type SocialProfile = {
  firstName: string;
  lastName: string;
  email: string;
  method: "google" | "apple";
};

type Auth = {
  user: User | null;
  ready: boolean;
  requestCode: (phone: string, intent?: AuthIntent) => Promise<{ phone: string; devCode?: string }>;
  verifyCode: (phone: string, code: string, intent?: AuthIntent, signup?: SignUpProfile) => Promise<User>;
  /** Start a session from an access token the API issued for a Google/Apple account. */
  adoptToken: (accessToken: string) => Promise<User>;
  /** Finish any sign-in response: a session, or the authenticator step first. Rejects if that step is cancelled. */
  adoptSignIn: (res: SignInResult) => Promise<User>;
  completeProfile: (p: { firstName: string; lastName: string; email?: string }) => Promise<User>;
  signOut: () => void;
  /** End every session of this account, on all devices. */
  signOutEverywhere: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth must be used inside <AuthProvider>");
  return a;
}

/** When the access token expires (from its `exp` claim), in ms since epoch. Not a security check — the API verifies tokens. */
function tokenExpiry(t: string): number | null {
  try {
    const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function clearExpiredNotice() {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mfa, setMfa] = useState<(MfaChallenge & { resolve: (u: User) => void; reject: (e: Error) => void }) | null>(null);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  /** Load the profile for the stored token. Network errors keep the token so we can retry. */
  const loadMe = useCallback(async () => {
    if (!token.get()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    }
  }, []);

  useEffect(() => {
    loadMe().finally(() => setReady(true));

    // Rejected token anywhere in the app → signed out here too.
    const offExpired = onSessionExpired(() => setUser(null));
    // Sign-in or sign-out in another tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) loadMe();
    };
    // Came back online (or to the tab) with a token but no profile yet: try again.
    const retry = () => {
      if (token.get() && !userRef.current) loadMe();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      offExpired();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [loadMe]);

  // End the session the moment the token expires, instead of waiting for the next API call to fail.
  useEffect(() => {
    const t = token.get();
    const exp = user && t ? tokenExpiry(t) : null;
    if (!exp) return;
    const expire = () => {
      if (token.get() !== t) return; // a newer session started meanwhile
      token.set(null);
      try {
        sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
      } catch {}
      setUser(null);
    };
    const ms = exp - Date.now();
    if (ms <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, Math.min(ms, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [user]);

  const requestCode = useCallback(
    (phone: string, intent: AuthIntent = "auto") =>
      api<{ phone: string; devCode?: string }>("/auth/otp/request", { method: "POST", body: { phone, intent }, auth: false }),
    [],
  );

  const startSession = useCallback((res: SignedIn) => {
    token.set(res.accessToken);
    clearExpiredNotice();
    setUser(res.user);
    return res.user;
  }, []);

  const adoptSignIn = useCallback(
    async (res: SignInResult): Promise<User> => {
      if (res.status === "signed_in") return startSession(res);
      return new Promise<User>((resolve, reject) => setMfa({ ...res, resolve, reject }));
    },
    [startSession],
  );

  const verifyCode = useCallback(
    async (phone: string, code: string, intent: AuthIntent = "auto", signup?: SignUpProfile) => {
      const res = await api<SignInResult>("/auth/otp/verify", {
        method: "POST",
        body: { phone, code, intent, ...(signup ?? {}) },
        auth: false,
      });
      return adoptSignIn(res);
    },
    [adoptSignIn],
  );

  const adoptToken = useCallback(async (accessToken: string) => {
    token.set(accessToken);
    clearExpiredNotice();
    try {
      const me = await api<User>("/me");
      setUser(me);
      return me;
    } catch (e) {
      token.set(null);
      throw e;
    }
  }, []);

  const completeProfile = useCallback(async (p: { firstName: string; lastName: string; email?: string }) => {
    const updated = await api<User>("/me", { method: "PATCH", body: { ...p, consent: true } });
    setUser(updated);
    return updated;
  }, []);

  const signOut = useCallback(() => {
    // End the session on the server too, so the token can't be reused. Best effort: signing out here never waits on it.
    const t = token.get();
    if (t) fetch(`${API_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, keepalive: true }).catch(() => {});
    token.set(null);
    setUser(null);
  }, []);

  const signOutEverywhere = useCallback(async () => {
    await api("/auth/logout-all", { method: "POST" });
    token.set(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, requestCode, verifyCode, adoptToken, adoptSignIn, completeProfile, signOut, signOutEverywhere }),
    [user, ready, requestCode, verifyCode, adoptToken, adoptSignIn, completeProfile, signOut, signOutEverywhere],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {mfa && (
        <MfaDialog
          kind={mfa.status}
          mfaToken={mfa.mfaToken}
          onDone={(res) => {
            mfa.resolve(startSession(res));
            setMfa(null);
          }}
          onCancel={() => {
            mfa.reject(new ApiError("Sign-in cancelled — request a new code to try again", 0));
            setMfa(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Accepts 0803…, 803… or +234803… and returns +234XXXXXXXXXX, or null if it isn't a Nigerian mobile number. */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("234")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^[789][01]\d{8}$/.test(d) ? `+234${d}` : null;
}

export const maskPhone = (p: string) => `${p.slice(0, 4)} ${p.slice(4, 7)} ••• ${p.slice(-4)}`;

export const isStaff = (u: User | null) => u?.role === "PHARMACIST" || u?.role === "PHARMACY_STAFF";

/** The phone (masked) or, for Google/Apple accounts without one, the email. */
export const contactLine = (u: User) => (u.phone ? maskPhone(u.phone) : (u.email ?? ""));

export const displayName = (u: User) => (u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : contactLine(u) || "Your account");

export const initials = (u: User) => (u.firstName ? `${u.firstName[0]}${u.lastName?.[0] ?? ""}` : (u.phone?.slice(-2) ?? u.email?.[0] ?? "•")).toUpperCase();
