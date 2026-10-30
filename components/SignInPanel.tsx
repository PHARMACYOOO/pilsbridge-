"use client";

import PhoneSignIn from "./PhoneSignIn";
import SocialSignIn from "./SocialSignIn";
import { useAuth, type User } from "@/lib/auth";

/**
 * Sign in without leaving the page (checkout, scan, track): Google, Apple or phone. A new account
 * then confirms its name and consent here too. `onDone` gets the finished account.
 */
export default function SignInPanel({ onDone }: { onDone?: (u: User) => void }) {
  const { user } = useAuth();

  // Signed in but the profile isn't finished: PhoneSignIn opens on the name and consent step.
  if (user) return <PhoneSignIn key="finish" onDone={onDone} />;

  return (
    <>
      <SocialSignIn onSignedIn={(u) => u.profileComplete && onDone?.(u)} />
      <div className="my-5 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">or use your phone</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <PhoneSignIn key="phone" onDone={onDone} />
    </>
  );
}
