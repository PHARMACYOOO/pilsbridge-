import type { Metadata } from "next";
import SignInClient from "@/components/SignInClient";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <SignInClient />;
}
