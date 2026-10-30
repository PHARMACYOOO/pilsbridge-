"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { api, ApiError, formatKobo, type ApiOrder } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadScript } from "@/lib/load-script";

const FLUTTERWAVE_SRC = "https://checkout.flutterwave.com/v3.js";

type PaymentStart =
  | { provider: "demo"; code: string; amount: number; currency: "NGN" }
  | {
      provider: "flutterwave";
      code: string;
      publicKey: string;
      txRef: string;
      amount: number;
      currency: "NGN";
      paymentOptions: string;
      customer: { email: string; name: string; phone_number?: string };
    };

declare global {
  interface Window {
    FlutterwaveCheckout?: (o: {
      public_key: string;
      tx_ref: string;
      amount: number;
      currency: string;
      payment_options: string;
      customer: { email: string; name: string; phone_number?: string };
      customizations: { title: string; description: string };
      callback: (r: { transaction_id: number; status: string }) => void;
      onclose: () => void;
    }) => { close: () => void };
  }
}

/**
 * "Pay ₦…" for an accepted, unpaid order. Opens Flutterwave's checkout on the page (card, transfer
 * or USSD); the API verifies the payment with Flutterwave before the order counts as paid. In
 * development without Flutterwave keys, a demo payment stands in.
 */
export default function PayButton({
  order,
  onPaid,
  autoStart = false,
}: {
  order: Pick<ApiOrder, "code" | "totalKobo">;
  onPaid: (o: ApiOrder) => void;
  /** Open the checkout straight away (right after "Continue to payment"). */
  autoStart?: boolean;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const confirming = useRef(false);
  const needsEmail = !user?.email;

  async function confirm(path: "confirm" | "demo", body?: { transactionId: number }) {
    confirming.current = true;
    setBusy(true);
    setError(null);
    try {
      onPaid(await api<ApiOrder>(`/orders/${order.code}/payment/${path}`, { method: "POST", ...(body ? { body } : {}) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn’t confirm your payment. If you were charged, it will show here shortly.");
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const start = await api<PaymentStart>(`/orders/${order.code}/payment`, { method: "POST", body: email.trim() ? { email: email.trim() } : {} });
      if (start.provider === "demo") {
        setDemo(true);
        setBusy(false);
        return;
      }
      await loadScript(FLUTTERWAVE_SRC);
      if (!window.FlutterwaveCheckout) throw new Error("checkout unavailable");
      const modal = window.FlutterwaveCheckout({
        public_key: start.publicKey,
        tx_ref: start.txRef,
        amount: start.amount,
        currency: start.currency,
        payment_options: start.paymentOptions,
        customer: start.customer,
        customizations: { title: "Pilbridge", description: `Order ${start.code}` },
        callback: (r) => {
          modal.close();
          confirm("confirm", { transactionId: r.transaction_id });
        },
        onclose: () => {
          if (!confirming.current) setBusy(false);
        },
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : "Couldn’t open the payment window — check your connection and try again.");
    }
  }

  // Open the checkout once, straight after the order is created, when nothing else is needed first.
  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !needsEmail && !started.current) {
      started.current = true;
      pay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, needsEmail]);

  return (
    <div className="space-y-3">
      {needsEmail && (
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">Email for your receipt</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="mt-2 h-11 w-full border border-line bg-transparent px-3.5 text-[13.5px] text-bone placeholder:text-mute focus:border-gold focus:outline-none"
          />
        </label>
      )}
      <button
        onClick={pay}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-graphite disabled:text-mute"
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2} /> {busy ? "Waiting for payment…" : `Pay ${formatKobo(order.totalKobo)}`}
      </button>
      {error && <p className="text-[13px] text-alert">{error}</p>}
      <p className="text-center font-mono text-[10.5px] text-mute">Secured by Flutterwave · Card · Transfer · USSD</p>

      {demo && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Demo payment">
          <button className="absolute inset-0 bg-black/70" onClick={() => setDemo(false)} aria-label="Close" />
          <div className="relative w-full max-w-[420px] border border-line bg-coal p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-warn">Demo mode</p>
                <p className="mt-2 font-display text-[26px] leading-tight text-ivory">Flutterwave isn&apos;t connected yet</p>
              </div>
              <button onClick={() => setDemo(false)} className="p-1 text-stone hover:text-bone" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-stone">
              Add <span className="font-mono text-[12px] text-bone">FLW_PUBLIC_KEY</span> and{" "}
              <span className="font-mono text-[12px] text-bone">FLW_SECRET_KEY</span> to the API&apos;s{" "}
              <span className="font-mono text-[12px] text-bone">backend/.env</span> to take real payments. For now you can mark order{" "}
              {order.code} as paid (development only — no money moves).
            </p>
            <button
              onClick={() => {
                setDemo(false);
                confirm("demo");
              }}
              className="mt-6 w-full rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink hover:bg-gold-soft"
            >
              Pay {formatKobo(order.totalKobo)} (demo)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
