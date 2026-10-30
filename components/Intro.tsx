"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const KEY = "pilbridge-intro-seen";
const READY_AFTER_MS = 2600;
const EXIT_MS = 950;

const custody = [
  ["09:41", "Batch AMX-2309-114 verified against distributor invoice"],
  ["09:44", "Prescription approved — Pharm. A. Okafor, Ikeja GRA"],
  ["09:58", "Parcel sealed · tamper seal #S-55821"],
  ["10:06", "Custody scan — rider collected at counter"],
  ["10:39", "Delivered · Yaba · code confirmed"],
];

const tagline = ["The right medicine.", "The right shelf.", "The right door."];

function markSeen() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}

function alreadySeen() {
  if (document.documentElement.dataset.introSeen) return true;
  try {
    return !!sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** `/?intro` asks for the intro to play again, even if it was already seen this session. */
function forcedReplay() {
  return new URLSearchParams(window.location.search).has("intro");
}

// Runs during HTML parsing, before the overlay paints, so returning visitors never see a flash of it.
const preflight = `try{var q=new URLSearchParams(location.search);if(q.has('intro')){sessionStorage.removeItem('${KEY}')}else if(sessionStorage.getItem('${KEY}')){document.documentElement.dataset.introSeen='1'}}catch(e){}`;

export default function Intro() {
  const [phase, setPhase] = useState<"playing" | "ready" | "leaving" | "gone">("playing");
  const enterRef = useRef<HTMLButtonElement>(null);

  const enter = useCallback(() => {
    setPhase((p) => (p === "leaving" || p === "gone" ? p : "leaving"));
    markSeen();
    if (forcedReplay()) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    window.setTimeout(() => {
      document.documentElement.dataset.introSeen = "1";
      setPhase("gone");
    }, EXIT_MS);
  }, []);

  // Client-side navigations back to "/" don't re-run the preflight script, so check before paint here too.
  useLayoutEffect(() => {
    if (forcedReplay()) {
      delete document.documentElement.dataset.introSeen;
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
    } else if (alreadySeen()) {
      setPhase("gone");
    }
  }, []);

  useEffect(() => {
    if (alreadySeen()) return;
    const ready = window.setTimeout(() => setPhase((p) => (p === "playing" ? "ready" : p)), READY_AFTER_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        enter();
      }
    };
    let touchY = 0;
    const onWheel = (e: WheelEvent) => e.deltaY > 30 && enter();
    const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0].clientY);
    const onTouchEnd = (e: TouchEvent) => touchY - e.changedTouches[0].clientY > 60 && enter();

    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.clearTimeout(ready);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enter]);

  useEffect(() => {
    if (phase === "ready") enterRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: preflight }} />
      <div
        className="intro grain fixed inset-0 z-[100] flex flex-col overflow-hidden bg-ink text-bone"
        data-open=""
        data-leaving={phase === "leaving" ? "" : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Pilbridge"
      >
        <div className="rule-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_30%_60%,black_10%,transparent_70%)]" />

        {/* Top bar */}
        <header className="intro-fade relative flex items-center justify-between px-5 pt-5 sm:px-10 sm:pt-8" style={{ animationDelay: "0.2s" }}>
          <span className="eyebrow text-stone">Pharmaceutical redistribution &amp; delivery</span>
        </header>

        {/* Centre */}
        <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 items-center gap-12 px-5 sm:px-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <svg viewBox="0 0 32 32" className="h-16 w-16 text-gold sm:h-20 sm:w-20" aria-hidden="true">
              <path className="intro-draw" d="M5.5 27 L16 4.5 L26.5 27" fill="none" stroke="currentColor" strokeWidth="1.2" pathLength={100} />
              <path className="intro-draw" style={{ animationDelay: "0.5s" }} d="M2.5 27 H29.5" stroke="currentColor" strokeWidth="0.9" pathLength={100} />
              <circle className="intro-dot" cx="16" cy="18.6" r="2.4" fill="currentColor" />
            </svg>

            <h1 className="mt-6 overflow-hidden pb-[0.08em] font-display leading-[0.9] tracking-[-0.035em] text-ivory" style={{ fontSize: "clamp(60px, 13vw, 206px)" }}>
              {"Pilbridge".split("").map((ch, i) => (
                <span key={i} className="intro-rise inline-block" style={{ animationDelay: `${0.55 + i * 0.055}s` }}>
                  {ch}
                </span>
              ))}
            </h1>

            <p className="mt-6 flex flex-wrap gap-x-3 font-display text-[22px] italic leading-snug sm:text-[30px]">
              {tagline.map((t, i) => (
                <span key={t} className="overflow-hidden">
                  <span
                    className={`intro-rise inline-block ${i === 2 ? "text-gold" : "text-stone"}`}
                    style={{ animationDelay: `${1.25 + i * 0.22}s` }}
                  >
                    {t}
                  </span>
                </span>
              ))}
            </p>
          </div>

          {/* Chain-of-custody log */}
          <div className="hidden border-l border-line pl-8 lg:block">
            <p className="intro-fade eyebrow text-mute" style={{ animationDelay: "1s" }}>Chain of custody · live sample</p>
            <ol className="mt-6 space-y-4">
              {custody.map(([t, e], i) => (
                <li key={t} className="intro-fade grid grid-cols-[52px_1fr] font-mono text-[12px] leading-relaxed" style={{ animationDelay: `${1.2 + i * 0.28}s` }}>
                  <span className={i === custody.length - 1 ? "text-gold" : "text-mute"}>{t}</span>
                  <span className={i === custody.length - 1 ? "text-bone" : "text-stone"}>{e}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Bottom */}
        <footer className="relative mx-auto w-full max-w-[1320px] px-5 pb-6 sm:px-10 sm:pb-9">
          <div className="h-px w-full bg-line">
            <div className="intro-progress h-px w-full origin-left bg-gold" />
          </div>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <ul className="intro-fade flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] text-stone" style={{ animationDelay: "1.6s" }}>
              {["Licensed partner pharmacies", "Pharmacist-reviewed prescriptions", "Tracked to your door"].map((f, i) => (
                <li key={f}>
                  <span className="mr-2 text-gold">0{i + 1}</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className={`flex flex-col gap-4 transition-all duration-700 md:items-end ${phase === "playing" ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}>
              <button
                ref={enterRef}
                onClick={enter}
                tabIndex={phase === "playing" ? -1 : 0}
                className="group flex items-center justify-center gap-3 rounded-[3px] bg-gold px-7 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-gold-soft focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-gold/60"
              >
                Enter Pilbridge
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} />
              </button>
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-stone md:justify-end">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Or go straight to</span>
                {[
                  ["/order", "Order medicine"],
                  ["/scan", "Snap a prescription"],
                  ["/pharmacies", "Partner with us"],
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={markSeen}
                    className="hover:text-gold-soft"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
