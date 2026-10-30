"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Camera, Check, CircleAlert, FileUp, ShieldCheck } from "lucide-react";
import DeliverTo from "./DeliverTo";
import PayButton from "./PayButton";
import SignInPanel from "./SignInPanel";
import { ClassBadge, OrderTotals } from "./OrderSummary";
import { api, ApiError, formatKobo, type ApiOrder } from "@/lib/api";
import { displayName, isStaff, maskPhone, useAuth, type User } from "@/lib/auth";
import { ADDRESS_KEY, useBag, useOrderTotals, useQuotes, useSavedAddress } from "@/lib/bag";
import { naira } from "@/lib/catalog";
import { clock, etaLabel, useDeliveryArea, useDropoffPin } from "@/lib/delivery";
import { useCatalog } from "@/lib/useCatalog";

/** A small real JPEG, so the demo can exercise the upload path without a camera. */
async function sampleRxFile(): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 800;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f6f3ea";
  g.fillRect(0, 0, 600, 800);
  g.fillStyle = "#1c2a5a";
  g.font = "28px Georgia";
  g.fillText("Sample prescription — demo only", 40, 80);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
  return new File([blob], "sample-prescription.jpg", { type: "image/jpeg" });
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-coal px-5 py-6 sm:px-7">
      <p className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-gold">{n}</span>
        <span className="font-display text-[24px] leading-none text-ivory">{title}</span>
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function CheckoutClient() {
  const { products, loading, offline } = useCatalog();
  const { user, signOut } = useAuth();
  const [bag, setBag, bagReady] = useBag(products);
  const [address, setAddress] = useSavedAddress();
  const [area, setArea] = useDeliveryArea();
  const [pin, setPin] = useDropoffPin();
  const { quotes, pharmacyId } = useQuotes(bag, offline, area);
  const { needsRx, quote, live, deliveryKobo, totalKobo } = useOrderTotals(bag, quotes, pharmacyId, pin, address);
  const [rxFile, setRxFile] = useState<File | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<ApiOrder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const canCheckout = bag.length > 0 && !offline && !!quote && quote.unavailable === 0 && (!needsRx || !!rxFile) && !!area && address.trim().length >= 5;

  async function placeOrder(signedIn?: User) {
    const who = signedIn ?? user;
    setError(null);
    if (!who || !who.profileComplete) {
      setAskSignIn(true);
      return;
    }
    if (isStaff(who)) {
      setError("Pharmacy staff accounts can’t place patient orders. Sign in with a personal number.");
      return;
    }
    if (!quote) return;
    setBusy(true);
    try {
      let prescriptionId: string | undefined;
      if (needsRx && rxFile) {
        const form = new FormData();
        form.append("image", rxFile);
        prescriptionId = (await api<{ id: string }>("/prescriptions", { method: "POST", form })).id;
      }
      const order = await api<ApiOrder>("/orders", {
        method: "POST",
        body: {
          pharmacyId: quote.pharmacy.id,
          deliveryAddress: address.trim(),
          deliveryArea: area,
          ...(pin ? { dropoffLat: pin.lat, dropoffLng: pin.lng } : {}),
          ...(pin && live?.quoteId ? { deliveryQuoteId: live.quoteId } : {}),
          items: bag.map((l) => ({ productId: l.product.id, quantity: l.qty })),
          ...(prescriptionId ? { prescriptionId } : {}),
        },
      });
      try {
        localStorage.setItem(ADDRESS_KEY, address.trim());
      } catch {}
      setPlaced(order);
      setBag([]);
      setRxFile(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn’t place your order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pb-24 pt-14 sm:px-8">
        <div className="border border-line bg-coal px-6 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold text-gold">
            <Check className="h-5 w-5" />
          </span>
          <p className="mt-5 font-display text-[28px] leading-tight text-ivory">
            {placed.status === "ACCEPTED" && placed.paymentStatus === "UNPAID" ? `Order ${placed.code} — pay to confirm` : `Order ${placed.code} placed`}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-stone">
            {placed.status === "PHARMACIST_REVIEW"
              ? `Your prescription is with a pharmacist at ${placed.pharmacy.name}. Once it’s approved, you’ll pay from the tracking page.`
              : placed.paymentStatus === "PAID"
                ? `Paid — ${placed.pharmacy.name} is getting your order ready${placed.arriveBy ? `. Arriving by ${clock(placed.arriveBy)}` : ""}.`
                : `${placed.pharmacy.name} starts preparing your order as soon as you’ve paid.`}
          </p>
          <p className="mt-3 font-mono text-[12px] text-mute">Total {formatKobo(placed.totalKobo)}</p>
          {placed.status === "ACCEPTED" && placed.paymentStatus === "UNPAID" && (
            <div className="mt-6 text-left">
              <PayButton order={placed} autoStart onPaid={setPlaced} />
            </div>
          )}
          <Link href={`/track?code=${placed.code}`} className="mt-6 inline-flex items-center gap-1.5 text-[14px] text-gold hover:text-gold-soft">
            Track this order <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && bagReady && bag.length === 0) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pb-24 pt-14 text-center sm:px-8">
        <p className="font-display text-[28px] text-ivory">Your bag is empty.</p>
        <p className="mt-2 text-[14px] text-stone">Add your medicines first, then come back to choose where they&apos;re delivered.</p>
        <Link href="/order" className="mt-6 inline-flex items-center gap-2 rounded-[3px] bg-gold px-6 py-3 text-[14px] font-medium text-ink hover:bg-gold-soft">
          <ArrowLeft className="h-4 w-4" /> Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 pt-10 sm:px-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <Link href="/order" className="inline-flex items-center gap-1.5 text-[13.5px] text-stone hover:text-gold-soft">
          <ArrowLeft className="h-4 w-4" /> Back to your order
        </Link>

        {offline && (
          <div className="flex gap-3 border-l-2 border-warn bg-warn/10 px-4 py-3.5 text-[13.5px] leading-relaxed text-bone">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p>We can&apos;t reach Pilbridge right now. Ordering will be back shortly.</p>
          </div>
        )}

        <Step n="01" title="Delivery address">
          <DeliverTo area={area} onArea={setArea} address={address} onAddress={setAddress} pin={pin} onPin={setPin} />
          {quote?.etaMinutes != null && (
            <p className="mt-4 text-[12.5px] text-stone">
              Arrives about <span className="text-bone">{etaLabel(quote.etaMinutes)}</span> after you pay, from {quote.pharmacy.name}.
            </p>
          )}
        </Step>

        {needsRx && (
          <Step n="02" title="Prescription">
            <p className="text-[13px] leading-relaxed text-stone">
              Items marked Rx need a prescription. Add or snap it — a pharmacist checks it, then you pay.
            </p>
            {[fileRef, camRef].map((ref, i) => (
              <input
                key={i}
                ref={ref}
                type="file"
                accept={ref === camRef ? "image/*" : ".pdf,.jpg,.jpeg,.png,.webp"}
                capture={ref === camRef ? "environment" : undefined}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setRxFile(f);
                  e.target.value = "";
                }}
              />
            ))}
            {!rxFile ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(
                    [
                      [camRef, Camera, "Snap a photo"],
                      [fileRef, FileUp, "Upload a file"],
                    ] as const
                  ).map(([ref, Icon, text]) => (
                    <button
                      key={text}
                      onClick={() => ref.current?.click()}
                      className="flex flex-col items-center gap-2 border border-dashed border-gold/40 bg-gold-wash px-3 py-5 text-center transition-colors hover:border-gold"
                    >
                      <Icon className="h-5 w-5 text-gold" strokeWidth={1.5} />
                      <span className="text-[13px] text-bone">{text}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center font-mono text-[10.5px] text-mute">Photo, PDF, JPG or PNG · max 10 MB</p>
                <button
                  onClick={async () => setRxFile(await sampleRxFile())}
                  className="mt-2 w-full text-center font-mono text-[10.5px] text-mute underline-offset-2 hover:text-stone hover:underline"
                >
                  Use a sample file for this demo
                </button>
              </>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3 border border-line-soft bg-char p-3.5">
                <p className="truncate text-[13px] text-bone">{rxFile.name}</p>
                <button onClick={() => setRxFile(null)} className="font-mono text-[10.5px] text-mute hover:text-alert">Remove</button>
              </div>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-mute">Sent securely to the pharmacist only when you place the order.</p>
          </Step>
        )}

        <Step n={needsRx ? "03" : "02"} title={needsRx ? "Send to pharmacist" : "Confirm and pay"}>
          {user?.profileComplete && (
            <p className="mb-5 flex items-center justify-between gap-3 text-[13px] text-stone">
              <span>
                Ordering as <span className="text-bone">{displayName(user)}</span>
                {user.phone && <> · {maskPhone(user.phone)}</>}
              </span>
              <button onClick={signOut} className="shrink-0 text-mute hover:text-gold">Not you?</button>
            </p>
          )}

          {error && <p className="mb-4 flex items-start gap-2 text-[13px] text-alert"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

          {askSignIn && !user?.profileComplete ? (
            <div>
              <div className="mb-4 flex items-baseline justify-between">
                <p className="eyebrow text-gold">Your details</p>
                <button onClick={() => setAskSignIn(false)} className="text-[12.5px] text-mute hover:text-bone">Cancel</button>
              </div>
              <p className="mb-4 text-[13px] leading-relaxed text-stone">
                {user
                  ? "Confirm your name for the pharmacist, then we’ll place your order."
                  : "Sign in so the pharmacist knows who’s ordering — your basket stays put. New here? This creates your account."}
              </p>
              <SignInPanel
                onDone={(u) => {
                  setAskSignIn(false);
                  placeOrder(u);
                }}
              />
            </div>
          ) : (
            <>
              <button
                disabled={!canCheckout || busy}
                onClick={() => placeOrder()}
                className="w-full rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-graphite disabled:text-mute"
              >
                {busy
                  ? needsRx
                    ? "Sending…"
                    : "Creating your order…"
                  : offline
                    ? "Ordering unavailable"
                    : !quote
                      ? "Checking stock…"
                      : quote.unavailable > 0
                        ? "Choose a pharmacy with everything"
                        : !area
                          ? "Choose your delivery area"
                          : address.trim().length < 5
                            ? "Add a delivery address"
                            : needsRx && !rxFile
                              ? "Add your prescription to continue"
                              : needsRx
                                ? "Send to pharmacist"
                                : "Continue to payment"}
              </button>
              <p className="mt-3 text-center font-mono text-[10.5px] text-mute">
                {needsRx ? "You’ll pay once a pharmacist approves your prescription" : "Secured by Flutterwave · Card · Transfer · USSD"}
              </p>
            </>
          )}
        </Step>
      </div>

      {/* ——— Summary ——— */}
      <aside className="lg:sticky lg:top-[120px] lg:self-start">
        <div className="border border-line bg-coal">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-[24px] leading-none text-ivory">Your order</h2>
            <Link href="/order" className="font-mono text-[11px] text-gold hover:text-gold-soft">Edit</Link>
          </div>
          <ul className="divide-y divide-line-soft px-5">
            {bag.map((l) => {
              const line = quote?.lines.find((x) => x.productId === l.product.id);
              return (
                <li key={l.product.id} className="flex items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-bone">
                      {l.product.name} {l.product.strength !== "—" && l.product.strength}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ClassBadge p={l.product} />
                      <span className="font-mono text-[11px] text-mute">× {l.qty}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[14px] text-bone">
                    {line?.unitPriceKobo != null ? formatKobo(line.unitPriceKobo * l.qty) : naira(l.product.price * l.qty)}
                  </span>
                </li>
              );
            })}
          </ul>
          {quote && (
            <div className="border-t border-line px-5 py-5">
              <p className="mb-4 text-[12.5px] text-stone">
                From <span className="text-bone">{quote.pharmacy.name}</span> · {quote.pharmacy.area}
              </p>
              <OrderTotals quote={quote} live={live} deliveryKobo={deliveryKobo} totalKobo={totalKobo} />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3 border border-line-soft px-5 py-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />
          <p className="text-[12.5px] leading-relaxed text-stone">
            Fulfilled by a PCN-licensed partner pharmacy. Your prescription is visible only to the reviewing pharmacist —
            never to the rider.
          </p>
        </div>
      </aside>
    </div>
  );
}
