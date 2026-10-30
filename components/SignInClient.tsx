"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Check, CircleAlert, User as UserIcon } from "lucide-react";
import PhoneSignIn from "./PhoneSignIn";
import SocialSignIn from "./SocialSignIn";
import { SESSION_EXPIRED_KEY } from "@/lib/api";
import { displayName, isStaff, useAuth, type User } from "@/lib/auth";

type As = "patient" | "partner";

/** Only same-site paths are allowed as a post-sign-in destination. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);

export default function SignInClient() {
  const router = useRouter();
  const { user, ready, signOut } = useAuth();
  const [as, setAs] = useState<As>("patient");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [carriedPhone, setCarriedPhone] = useState("");

  const switchMode = (m: "signin" | "signup", phone = "") => {
    setMode(m);
    setCarriedPhone(phone);
    setNotice(null);
    // Keep the URL in step so refresh and sharing land on the same form.
    const url = new URL(window.location.href);
    if (m === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url);
  };
  const [next, setNext] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("as") === "partner") setAs("partner");
    if (p.get("mode") === "signup") setMode("signup");
    setNext(safeNext(p.get("next")));
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) setNotice("Your session expired — please sign in again.");
    } catch {}
  }, []);

  const finishPatient = (u: User) => router.push(next ?? (isStaff(u) ? "/portal" : u.role === "RIDER" ? "/rider" : u.role === "PLATFORM_ADMIN" ? "/admin" : "/"));

  return (
    <div className="mx-auto grid max-w-[1240px] gap-12 px-4 pb-24 pt-14 sm:px-8 lg:grid-cols-[1fr_460px] lg:gap-20 lg:pt-20">
      <div className="lg:pt-6">
        <p className="eyebrow text-gold">{mode === "signup" ? "Create an account" : "Sign in"}</p>
        <h1 className="mt-5 font-display text-[46px] leading-[1.02] tracking-[-0.02em] text-ivory sm:text-[60px]">
          {as === "patient" ? (
            <>Your medicines, <em className="text-gold">one tap away.</em></>
          ) : (
            <>Welcome back to <em className="text-gold">the network.</em></>
          )}
        </h1>
        <ul className="mt-10 max-w-[44ch] space-y-4">
          {(as === "patient"
            ? ["Track every order from pharmacy counter to your door", "Keep your prescriptions in one place for faster refills", "Message the pharmacist handling your order"]
            : ["Review prescriptions and release orders", "List surplus stock for pharmacist-approved transfers", "Track deliveries, payouts and licence renewals"]
          ).map((t) => (
            <li key={t} className="flex gap-3 text-[15px] text-stone">
              <Check className="mt-1 h-4 w-4 shrink-0 text-gold" strokeWidth={2} />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-line bg-coal">
        <div className="grid grid-cols-2 border-b border-line" role="tablist">
          {(
            [
              ["patient", "Patient", UserIcon],
              ["partner", "Partner", Building2],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={as === v}
              onClick={() => setAs(v)}
              className={`-mb-px flex items-center justify-center gap-2 border-b-2 py-4 text-[14px] transition-colors ${as === v ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-bone"}`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.6} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 sm:p-8">
          {!ready ? (
            <div className="h-[220px]" />
          ) : as === "partner" ? (
            <PartnerSignIn />
          ) : user?.profileComplete ? (
            <div className="space-y-5">
              <p className="text-[15px] text-stone">
                You&apos;re signed in as <span className="text-bone">{displayName(user)}</span>.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={next ?? (isStaff(user) ? "/portal" : "/order")} className="rounded-[3px] bg-gold px-5 py-3 text-[14px] font-medium text-ink hover:bg-gold-soft">
                  Continue
                </Link>
                <button onClick={signOut} className="rounded-[3px] border border-line px-5 py-3 text-[14px] text-bone hover:border-gold">
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <>
              {user ? (
                <h2 className="mb-6 font-display text-[28px] leading-none text-ivory">Finish setting up</h2>
              ) : (
                <>
                  <div className="mb-6 grid grid-cols-2 border border-line p-1" role="tablist" aria-label="Sign in or create an account">
                    {(
                      [
                        ["signin", "Sign in"],
                        ["signup", "Create account"],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => switchMode(m)}
                        className={`py-2.5 text-[13.5px] transition-colors ${mode === m ? "bg-gold font-medium text-ink" : "text-stone hover:text-bone"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <h2 className="mb-2 font-display text-[28px] leading-none text-ivory">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
                  <p className="mb-6 text-[13.5px] text-stone">
                    {mode === "signup" ? (
                      <>Already have an account? <button onClick={() => switchMode("signin")} className="text-gold hover:text-gold-soft">Sign in</button></>
                    ) : (
                      <>New to Pilbridge? <button onClick={() => switchMode("signup")} className="text-gold hover:text-gold-soft">Create an account</button></>
                    )}
                  </p>
                </>
              )}
              {notice && (
                <p className="mb-5 flex items-start gap-2 border-l-2 border-alert bg-alert/10 px-3.5 py-2.5 text-[13px] text-bone">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" /> {notice}
                </p>
              )}
              {!user && (
                <>
                  {/* New accounts stay here to confirm their name and consent (the "Finish setting up" step). */}
                  <SocialSignIn onSignedIn={(u) => u.profileComplete && finishPatient(u)} />
                  <div className="my-6 flex items-center gap-4">
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">or use your phone</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </>
              )}
              <PhoneSignIn
                key={user ? "finish" : `${mode}:${carriedPhone}`}
                intent={user ? "auto" : mode}
                initialPhone={carriedPhone}
                onSwitchIntent={switchMode}
                onDone={finishPatient}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pharmacy staff sign in with the phone number registered to their pharmacy account. */
function PartnerSignIn() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [notPartner, setNotPartner] = useState(false);

  if (user && isStaff(user)) {
    return (
      <div className="space-y-5">
        <h2 className="font-display text-[28px] leading-none text-ivory">Partner sign in</h2>
        <p className="text-[15px] text-stone">
          Signed in as <span className="text-bone">{displayName(user)}</span>
          {user.pharmacy && <> · {user.pharmacy.name}</>}.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal" className="rounded-[3px] bg-gold px-5 py-3 text-[14px] font-medium text-ink hover:bg-gold-soft">Open portal</Link>
          <button onClick={signOut} className="rounded-[3px] border border-line px-5 py-3 text-[14px] text-bone hover:border-gold">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-[28px] leading-none text-ivory">Partner sign in</h2>
      <p className="text-[13.5px] leading-relaxed text-stone">Use the mobile number registered to your pharmacy account.</p>
      {notPartner || (user && !isStaff(user)) ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 border-l-2 border-warn bg-warn/10 px-3.5 py-2.5 text-[13px] text-bone">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            This number isn&apos;t linked to a partner account. If you&apos;re a patient, you&apos;re signed in and can order as usual.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/order" className="rounded-[3px] border border-line px-4 py-2.5 text-[13.5px] text-bone hover:border-gold">Continue as patient</Link>
            <button
              onClick={() => {
                signOut();
                setNotPartner(false);
              }}
              className="text-[13.5px] text-gold hover:text-gold-soft"
            >
              Use another number
            </button>
          </div>
        </div>
      ) : (
        <PhoneSignIn
          intent="signin"
          skipProfile
          notFoundMessage="This number isn’t registered to a partner account. Pharmacies join by applying below."
          onDone={(u) => (isStaff(u) ? router.push("/portal") : setNotPartner(true))}
        />
      )}

      <div className="border-t border-line-soft pt-5">
        <p className="text-[13px] text-stone">Not a partner yet? Accounts are created after we verify your licences.</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          {[
            ["/pharmacies#apply", "Apply as a pharmacy"],
            ["/hospitals#apply", "Hospitals & clinics"],
            ["/logistics#apply", "Logistics partners"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex items-center gap-1 text-gold hover:text-gold-soft">
              {label} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
