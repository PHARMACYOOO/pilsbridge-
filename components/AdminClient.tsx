"use client";

import { useState } from "react";
import PhoneSignIn from "./PhoneSignIn";
import Accounts from "./admin/Accounts";
import Applications from "./admin/Applications";
import Compliance from "./admin/Compliance";
import Couriers from "./admin/Couriers";
import Incidents from "./admin/Incidents";
import Invoices from "./admin/Invoices";
import Live from "./admin/Live";
import Onboarding from "./admin/Onboarding";
import Payouts from "./admin/Payouts";
import Pharmacies from "./admin/Pharmacies";
import Products from "./admin/Products";
import Reports from "./admin/Reports";
import Riders from "./admin/Riders";
import Transfers from "./admin/Transfers";
import { ghost } from "./admin/shared";
import { useAuth } from "@/lib/auth";

const tabs = [
  ["live", "Live deliveries"],
  ["reports", "Reports"],
  ["incidents", "Incidents"],
  ["invoices", "Courier invoices"],
  ["couriers", "Couriers"],
  ["riders", "Riders"],
  ["onboarding", "Pharmacies"],
  ["applications", "Applications"],
  ["compliance", "Compliance"],
  ["payouts", "Payouts"],
  ["transfers", "Transfers"],
  ["pharmacies", "Pharmacy locations"],
  ["products", "Delivery eligibility"],
  ["accounts", "Accounts & security"],
] as const;
type Tab = (typeof tabs)[number][0];

/** Platform admin: dispatch and courier bookings, incidents, riders, couriers, pharmacy onboarding and compliance, payouts, transfers, pharmacy locations and delivery eligibility. */
export default function AdminClient() {
  const { user, ready, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("live");

  if (!ready) return <div className="h-[400px]" />;
  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-[32px] leading-none text-ivory">Admin sign in</h1>
        <p className="mb-6 mt-2 text-[13.5px] text-stone">Platform administrators only.</p>
        <div className="max-w-[420px]">
          <PhoneSignIn intent="signin" skipProfile notFoundMessage="This number isn’t registered as an administrator." />
        </div>
      </Shell>
    );
  }
  if (user.role !== "PLATFORM_ADMIN") {
    return (
      <Shell>
        <p className="text-[14px] text-stone">This page is for Pilbridge administrators.</p>
        <button onClick={signOut} className={`${ghost} mt-4`}>Sign out</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow text-gold">Admin</p>
      <h1 className="mt-2 font-display text-[40px] leading-none text-ivory">Operations</h1>
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-[14px] ${tab === v ? "border-gold text-gold-soft" : "border-transparent text-stone hover:text-bone"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "live" && <Live />}
      {tab === "reports" && <Reports />}
      {tab === "incidents" && <Incidents />}
      {tab === "invoices" && <Invoices />}
      {tab === "couriers" && <Couriers />}
      {tab === "riders" && <Riders />}
      {tab === "onboarding" && <Onboarding />}
      {tab === "applications" && <Applications />}
      {tab === "compliance" && <Compliance />}
      {tab === "payouts" && <Payouts />}
      {tab === "transfers" && <Transfers />}
      {tab === "pharmacies" && <Pharmacies />}
      {tab === "products" && <Products />}
      {tab === "accounts" && <Accounts />}
    </Shell>
  );
}


function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-8">{children}</div>;
}
