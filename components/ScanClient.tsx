"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  CircleAlert,
  ImageUp,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Snowflake,
  X,
} from "lucide-react";
import { Badge } from "./ui";
import DeliverTo from "./DeliverTo";
import PayButton from "./PayButton";
import SignInPanel from "./SignInPanel";
import { api, ApiError, formatKobo, type ApiOrder, type ApiQuote } from "@/lib/api";
import { displayName, isStaff, maskPhone, useAuth, type User } from "@/lib/auth";
import type { Product } from "@/lib/catalog";
import { etaLabel, useDeliveryArea, useDropoffPin, useLiveDelivery } from "@/lib/delivery";
import { useCatalog } from "@/lib/useCatalog";
import {
  describeDirections,
  matchProduct,
  packsNeeded,
  unitsNeeded,
  type ExtractedItem,
  type Extraction,
  type ScanResponse,
} from "@/lib/prescription";

type Stage = "start" | "camera" | "preview" | "reading" | "review" | "sent";
type Line = { item: ExtractedItem; product: Product | null; packs: number; included: boolean };

const MAX_EDGE = 1600;
const ADDRESS_KEY = "pilbridge-last-address";

async function downscale(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Matched, included lines merged by product — the basket we price and order. */
function basketOf(lines: Line[]) {
  const map = new Map<string, number>();
  for (const l of lines) if (l.included && l.product) map.set(l.product.id, Math.min(20, (map.get(l.product.id) ?? 0) + l.packs));
  return [...map].map(([productId, quantity]) => ({ productId, quantity }));
}

export default function ScanClient() {
  const { products, offline } = useCatalog();
  const [stage, setStage] = useState<Stage>("start");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [demo, setDemo] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [quotes, setQuotes] = useState<ApiQuote[] | null>(null);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [area, setArea] = useDeliveryArea();
  const [pin, setPin] = useDropoffPin();
  const quotedArea = useRef<string | null>(null);
  const [askSignIn, setAskSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<ApiOrder | null>(null);
  const { user, signOut } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  useEffect(() => {
    try {
      setAddress(localStorage.getItem(ADDRESS_KEY) ?? "");
    } catch {}
  }, []);

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      camRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError("We couldn't open your camera. Allow camera access, or upload a photo instead.");
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    stopCamera();
    setImage(await downscale(canvas.toDataURL("image/jpeg", 0.92)));
    setStage("preview");
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a photo (JPG or PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setImage(await downscale(reader.result as string));
        setError(null);
        setStage("preview");
      } catch {
        setError("We couldn't open that image. Try a different photo.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function read() {
    if (!image) return;
    setStage("reading");
    setError(null);
    try {
      const res = await fetch("/api/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = (await res.json()) as ScanResponse;
      if ("error" in data) throw new Error(data.error);
      if (!data.extraction.is_prescription || data.extraction.items.length === 0) {
        throw new Error("That doesn't look like a prescription. Make sure the whole page is in frame and try again.");
      }
      setExtraction(data.extraction);
      setDemo(data.demo);
      setLines(
        data.extraction.items.map((item) => {
          const product = matchProduct(item, products);
          return { item, product, packs: product ? packsNeeded(item, product) : 0, included: true };
        }),
      );
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading your prescription.");
      setStage("preview");
    }
  }

  function reset() {
    stopCamera();
    setImage(null);
    setExtraction(null);
    setLines([]);
    setQuotes(null);
    setSent(null);
    setError(null);
    setSendError(null);
    setStage("start");
  }

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  /* ——— Live prices at every verified pharmacy ——— */
  const basket = basketOf(lines);
  const basketKey = basket.map((b) => `${b.productId}:${b.quantity}`).join(",");
  useEffect(() => {
    if (stage !== "review" || !basket.length || offline) {
      setQuotes(null);
      return;
    }
    const t = window.setTimeout(() => {
      api<ApiQuote[]>("/quotes", { method: "POST", auth: false, body: { items: basket, ...(area ? { area } : {}) } })
        .then((qs) => {
          setQuotes(qs);
          // With an area, quotes come fastest first: pick the fastest that has everything (again when the area changes).
          const areaChanged = quotedArea.current !== area;
          quotedArea.current = area;
          setPharmacyId((current) => {
            if (!areaChanged && current && qs.some((q) => q.pharmacy.id === current)) return current;
            const complete = qs.filter((q) => q.unavailable === 0);
            const best = area ? complete[0] : [...complete].sort((a, b) => a.totalKobo - b.totalKobo)[0];
            return best?.pharmacy.id ?? qs[0]?.pharmacy.id ?? null;
          });
        })
        .catch(() => setQuotes(null));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, basketKey, offline, area]);

  const quote = quotes?.find((q) => q.pharmacy.id === pharmacyId) ?? null;
  const toQuote = lines.filter((l) => l.included && !l.product).length;
  const cheapest = Math.min(...(quotes ?? []).filter((q) => q.unavailable === 0 && q.subtotalKobo > 0).map((q) => q.totalKobo));
  const needsRx = lines.some((l) => l.included && l.product?.classification === "POM");
  const live = useLiveDelivery({
    pharmacyId: quote?.pharmacy.id ?? null,
    pin,
    prescription: needsRx,
    coldChain: lines.some((l) => l.included && !!l.product?.coldChain),
    address,
  });
  const deliveryKobo = live?.deliveryKobo ?? quote?.deliveryKobo ?? 0;
  const totalKobo = quote ? quote.subtotalKobo + deliveryKobo + quote.serviceKobo : 0;
  const canSend = !!quote && basket.length > 0 && quote.unavailable === 0 && !!area && address.trim().length >= 5;

  async function send(signedIn?: User) {
    const who = signedIn ?? user;
    setSendError(null);
    if (!who?.profileComplete) {
      setAskSignIn(true);
      return;
    }
    if (isStaff(who)) {
      setSendError("Pharmacy staff accounts can\u2019t place patient orders. Sign in with a personal number.");
      return;
    }
    if (!quote || !image) return;
    setBusy(true);
    try {
      let prescriptionId: string | undefined;
      if (needsRx) {
        const blob = await (await fetch(image)).blob();
        const form = new FormData();
        form.append("image", new File([blob], "prescription.jpg", { type: "image/jpeg" }));
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
          items: basket,
          ...(prescriptionId ? { prescriptionId } : {}),
        },
      });
      try {
        localStorage.setItem(ADDRESS_KEY, address.trim());
      } catch {}
      setSent(order);
      setStage("sent");
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "We couldn\u2019t send this to the pharmacy. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-8">
      {[fileRef, camRef].map((ref, i) => (
        <input
          key={i}
          ref={ref}
          type="file"
          accept="image/*"
          capture={ref === camRef ? "environment" : undefined}
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      ))}

      {error && stage !== "review" && (
        <div className="mb-6 flex items-start gap-3 border-l-2 border-alert bg-alert/10 px-4 py-3.5 text-[14px] text-bone">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-mute hover:text-bone">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ——— 1 · Start ——— */}
      {stage === "start" && (
        <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative flex min-h-[420px] flex-col items-center justify-center border border-dashed border-gold/40 bg-gold-wash px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/50 text-gold">
              <Camera className="h-7 w-7" strokeWidth={1.4} />
            </span>
            <p className="mt-7 font-display text-[34px] leading-tight text-ivory">Snap your prescription</p>
            <p className="mt-3 max-w-[40ch] text-[14.5px] leading-relaxed text-stone">
              We&apos;ll read each medicine, work out how many packs you need, and total the cost at licensed pharmacies
              near you.
            </p>
            <div className="mt-9 flex w-full max-w-[380px] flex-col gap-3 sm:flex-row">
              <button
                onClick={openCamera}
                className="flex flex-1 items-center justify-center gap-2 rounded-[3px] bg-gold px-5 py-3.5 text-[14px] font-medium text-ink hover:bg-gold-soft"
              >
                <Camera className="h-4 w-4" strokeWidth={1.75} /> Open camera
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-2 rounded-[3px] border border-line px-5 py-3.5 text-[14px] text-bone hover:border-gold hover:text-gold-soft"
              >
                <ImageUp className="h-4 w-4" strokeWidth={1.75} /> Upload a photo
              </button>
            </div>
            <p className="mt-5 font-mono text-[10.5px] text-mute">JPG or PNG · the whole page, flat and in focus</p>
          </div>

          <div className="space-y-10">
            <div>
              <p className="eyebrow text-gold">For a clean reading</p>
              <ul className="mt-5 space-y-3.5">
                {[
                  "Lay the prescription flat in good, even light",
                  "Fit the entire page in frame — including the prescriber's stamp and date",
                  "Hold steady until the handwriting is sharp",
                  "One prescription per photo",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-[14.5px] text-stone">
                    <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={2} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-line-soft pt-8">
              <p className="eyebrow text-gold">What happens next</p>
              <ol className="mt-5 space-y-4">
                {[
                  ["Read", "Our system transcribes each line — drug, strength and directions."],
                  ["Total", "We match it to partner stock and price it at pharmacies near you."],
                  ["Verify", "A registered pharmacist checks the original before anything is dispensed."],
                ].map(([t, b], i) => (
                  <li key={t} className="grid grid-cols-[30px_1fr]">
                    <span className="font-mono text-[11px] text-mute">0{i + 1}</span>
                    <p className="text-[14px] leading-relaxed text-stone">
                      <span className="text-bone">{t}.</span> {b}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
            <p className="flex gap-3 border border-line-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-mute">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={1.75} />
              Your photo is used only to read this prescription and is shared only with the reviewing pharmacist.
            </p>
          </div>
        </div>
      )}

      {/* ——— 2 · Camera ——— */}
      {stage === "camera" && (
        <div className="mx-auto max-w-[520px]">
          <div className="relative aspect-[3/4] overflow-hidden border border-line bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-[7%]">
              {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-gold ${c}`} />
              ))}
            </div>
            <p className="absolute inset-x-0 top-4 text-center font-mono text-[11px] text-ivory/80">
              Fit the whole prescription inside the frame
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={reset} className="px-3 py-2 text-[14px] text-stone hover:text-bone">Cancel</button>
            <button
              onClick={capture}
              aria-label="Take photo"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-gold transition-transform active:scale-95"
            >
              <span className="h-[56px] w-[56px] rounded-full bg-gold" />
            </button>
            <button
              onClick={() => {
                stopCamera();
                fileRef.current?.click();
                setStage("start");
              }}
              className="px-3 py-2 text-[14px] text-stone hover:text-bone"
            >
              Upload
            </button>
          </div>
        </div>
      )}

      {/* ——— 3 · Preview / Reading ——— */}
      {(stage === "preview" || stage === "reading") && image && (
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="relative mx-auto w-full max-w-[520px] overflow-hidden border border-line bg-coal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Your prescription" className={`block w-full ${stage === "reading" ? "opacity-70" : ""}`} />
            {stage === "reading" && (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(201,165,92,0.08),transparent)]" />
                <div className="scan-line absolute inset-x-0 h-px bg-gold shadow-[0_0_18px_4px_rgba(201,165,92,0.45)]" />
              </>
            )}
          </div>

          <div className="lg:pt-6">
            {stage === "preview" ? (
              <>
                <p className="eyebrow text-gold">Check your photo</p>
                <h2 className="mt-4 font-display text-[38px] leading-[1.08] text-ivory">Is every line readable?</h2>
                <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-stone">
                  Make sure the drug names, strengths and directions are sharp, and that the prescriber&apos;s details and
                  date are in frame.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={read} className="rounded-[3px] bg-gold px-6 py-3.5 text-[14px] font-medium text-ink hover:bg-gold-soft">
                    Read prescription
                  </button>
                  <button onClick={reset} className="flex items-center gap-2 rounded-[3px] border border-line px-5 py-3.5 text-[14px] text-bone hover:border-gold">
                    <RotateCcw className="h-4 w-4" strokeWidth={1.75} /> Retake
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow text-gold">Reading</p>
                <h2 className="mt-4 font-display text-[38px] leading-[1.08] text-ivory">Transcribing your prescription…</h2>
                <ul className="mt-8 space-y-4 font-mono text-[12px]">
                  {["Reading handwriting and shorthand", "Matching to licensed partner stock", "Pricing at pharmacies near you"].map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-stone">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-gold" style={{ animationDelay: `${i * 0.4}s` }} />
                      {s}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* ——— 4 · Review & total ——— */}
      {stage === "review" && extraction && (
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
              <div>
                <p className="eyebrow text-gold">Read from your photo</p>
                <h2 className="mt-3 font-display text-[38px] leading-none text-ivory">
                  {lines.length} item{lines.length === 1 ? "" : "s"} found
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {demo && <Badge tone="warn">Demo reading</Badge>}
                {extraction.date_written && <Badge>Dated {extraction.date_written}</Badge>}
                <button onClick={reset} className="ml-2 flex items-center gap-1.5 text-[13px] text-stone hover:text-gold-soft">
                  <RotateCcw className="h-3.5 w-3.5" /> Scan again
                </button>
              </div>
            </div>

            {(!extraction.prescriber_details_present || lines.some((l) => !l.item.legible)) && (
              <div className="mt-5 flex gap-3 border-l-2 border-warn bg-warn/10 px-4 py-3.5 text-[13.5px] leading-relaxed text-bone">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <p>
                  {!extraction.prescriber_details_present && "We couldn't see the prescriber's name or stamp — the pharmacist may ask for a clearer photo. "}
                  {lines.some((l) => !l.item.legible) && "Lines marked “Check” were hard to read; the pharmacist will confirm them against your original."}
                </p>
              </div>
            )}

            <ul className="mt-2">
              {lines.map((l, i) => {
                const units = unitsNeeded(l.item);
                const ql = l.product ? quote?.lines.find((x) => x.productId === l.product!.id) : undefined;
                const stocked = !!ql?.available;
                const unit = ql?.unitPriceKobo ?? 0;
                return (
                  <li key={i} className={`border-b border-line-soft py-6 transition-opacity ${l.included ? "" : "opacity-45"}`}>
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => updateLine(i, { included: !l.included })}
                        aria-label={l.included ? "Exclude item" : "Include item"}
                        className={`mt-1.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center border ${l.included ? "border-gold bg-gold text-ink" : "border-line"}`}
                      >
                        {l.included && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <h3 className="font-display text-[24px] leading-none text-ivory">
                            {l.item.drug} {l.item.strength && <span className="text-stone">{l.item.strength}</span>}
                          </h3>
                          {!l.item.legible && <Badge tone="warn">Check</Badge>}
                          {l.product?.classification === "POM" && <Badge tone="pom">Rx</Badge>}
                          {l.product?.coldChain && (
                            <Badge tone="cold"><Snowflake className="h-2.5 w-2.5" /> 2–8 °C</Badge>
                          )}
                        </div>
                        <p className="mt-2 font-mono text-[11.5px] text-mute">
                          “{l.item.directions}” <span className="text-stone">→ {describeDirections(l.item)}</span>
                          {units !== null && <span className="text-stone"> = {units} units</span>}
                        </p>

                        {l.product ? (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-line-soft bg-coal px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-[13.5px] text-bone">
                                {l.product.name} {l.product.strength !== "—" && l.product.strength} · {l.product.pack}
                              </p>
                              <p className="mt-0.5 font-mono text-[10.5px] text-mute">
                                {!quote ? "Checking prices…" : stocked ? `${formatKobo(unit)} per pack at ${quote.pharmacy.name}` : `Not available at ${quote.pharmacy.name}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-5">
                              <div className="flex items-center border border-line">
                                <button onClick={() => updateLine(i, { packs: Math.max(1, l.packs - 1) })} className="p-2 text-stone hover:text-bone" aria-label="Fewer packs">
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-14 text-center font-mono text-[12px]">{l.packs} pack{l.packs > 1 ? "s" : ""}</span>
                                <button onClick={() => updateLine(i, { packs: Math.min(20, l.packs + 1) })} className="p-2 text-stone hover:text-bone" aria-label="More packs">
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                              <span className={`w-[84px] text-right text-[15px] ${stocked ? "text-bone" : "text-mute"}`}>
                                {stocked ? formatKobo(unit * l.packs) : "—"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 border border-dashed border-line px-4 py-3 text-[13px] text-stone">
                            Not in our partner stock list yet — the pharmacist will source and quote this item.
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-[12.5px] leading-relaxed text-mute">
              Pack counts are worked out from the directions as written. We never substitute a different medicine or
              strength — only your pharmacist can advise on that.
            </p>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-[120px]">
            <div className="border border-line bg-coal">
              <div className="flex items-center gap-4 border-b border-line px-5 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image!} alt="" className="h-14 w-11 shrink-0 border border-line object-cover" />
                <div>
                  <p className="font-display text-[22px] leading-none text-ivory">Your total</p>
                  <p className="mt-1 font-mono text-[10.5px] text-mute">{offline ? "Prices unavailable offline" : "Live prices · verified pharmacies"}</p>
                </div>
              </div>

              {quotes && (
                <ul className="divide-y divide-line-soft">
                  {quotes.map((q) => (
                    <li key={q.pharmacy.id}>
                      <button
                        onClick={() => setPharmacyId(q.pharmacy.id)}
                        className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors ${pharmacyId === q.pharmacy.id ? "bg-gold-wash" : "hover:bg-char"}`}
                      >
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${pharmacyId === q.pharmacy.id ? "border-gold" : "border-line"}`}>
                          {pharmacyId === q.pharmacy.id && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-bone">{q.pharmacy.name}</span>
                          <span className="block font-mono text-[10.5px] text-mute">
                            {q.pharmacy.area}
                            {q.unavailable > 0 ? ` · ${q.unavailable} unavailable` : " · has all items"}
                            {q.etaMinutes != null && <span className="text-stone"> · delivery {etaLabel(q.etaMinutes)}</span>}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[14px] text-bone">{formatKobo(q.totalKobo)}</span>
                          {q.totalKobo === cheapest && q.unavailable === 0 && (
                            <span className="block font-mono text-[9.5px] uppercase tracking-[0.08em] text-ok">Lowest</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="space-y-2 border-t border-line px-5 py-5 text-[13.5px]">
                <div className="flex justify-between text-stone"><dt>Medicines</dt><dd>{quote ? formatKobo(quote.subtotalKobo) : "—"}</dd></div>
                <div className="flex justify-between text-stone">
                  <dt>Delivery{live?.source === "courier" && <span className="text-mute"> · live price to your pin</span>}</dt>
                  <dd>{quote ? formatKobo(deliveryKobo) : "—"}</dd>
                </div>
                <div className="flex justify-between text-stone"><dt>Service fee</dt><dd>{quote ? formatKobo(quote.serviceKobo) : "—"}</dd></div>
                <div className="flex justify-between border-t border-line-soft pt-3 text-ivory">
                  <dt className="text-[15px]">Estimated total</dt>
                  <dd className="font-display text-[30px] leading-none text-gold-soft">{quote ? formatKobo(totalKobo) : "—"}</dd>
                </div>
                {(toQuote > 0 || (quote && quote.unavailable > 0)) && (
                  <p className="pt-1 text-[12px] leading-relaxed text-mute">
                    {toQuote > 0 && `+ ${toQuote} item${toQuote > 1 ? "s" : ""} to be quoted by the pharmacist. `}
                    {quote && quote.unavailable > 0 && `${quote.unavailable} item${quote.unavailable > 1 ? "s" : ""} not stocked here — choose a pharmacy that has everything.`}
                  </p>
                )}
              </dl>

              <div className="border-t border-line px-5 py-5">
                <div className="mb-4">
                  <DeliverTo area={area} onArea={setArea} address={address} onAddress={setAddress} pin={pin} onPin={setPin} />
                </div>
                {sendError && <p className="mb-4 flex items-start gap-2 text-[13px] text-alert"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {sendError}</p>}
                {askSignIn && !user?.profileComplete ? (
                  <>
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="eyebrow text-gold">Your details</p>
                      <button onClick={() => setAskSignIn(false)} className="text-[12.5px] text-mute hover:text-bone">Cancel</button>
                    </div>
                    <p className="mb-4 text-[13px] leading-relaxed text-stone">
                      {user
                        ? "Confirm your name — it should match the prescription."
                        : "The pharmacist needs to know whose prescription this is. Sign in — your scan stays put, and new accounts are created automatically."}
                    </p>
                    <SignInPanel
                      onDone={(u) => {
                        setAskSignIn(false);
                        send(u);
                      }}
                    />
                  </>
                ) : (
                  <>
                    {user?.profileComplete && (
                      <p className="mb-4 flex items-center justify-between gap-3 text-[12.5px] text-stone">
                        <span>
                          Sending as <span className="text-bone">{displayName(user)}</span>
                          {user.phone && <> · {maskPhone(user.phone)}</>}
                        </span>
                        <button onClick={signOut} className="shrink-0 text-mute hover:text-gold">Not you?</button>
                      </p>
                    )}
                    <button
                      onClick={() => send()}
                      disabled={!canSend || busy}
                      className="w-full rounded-[3px] bg-gold py-3.5 text-[14px] font-medium text-ink hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-graphite disabled:text-mute"
                    >
                      {busy
                        ? "Sending…"
                        : !basket.length
                          ? "No items we can price yet"
                          : quote && quote.unavailable > 0
                            ? "Choose a pharmacy with everything"
                            : !area
                              ? "Choose your delivery area"
                              : address.trim().length < 5
                                ? "Add a delivery address"
                              : "Send to pharmacist for verification"}
                    </button>
                    <p className="mt-3 text-center text-[11.5px] leading-relaxed text-mute">
                      Nothing is charged until a pharmacist confirms your prescription and the final price.
                    </p>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ——— 5 · Sent ——— */}
      {stage === "sent" && sent && (
        <div className="mx-auto max-w-[620px] border border-gold/30 bg-gold-wash p-8 text-center sm:p-12">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold text-gold">
            <Check className="h-5 w-5" />
          </span>
          <p className="mt-6 font-mono text-[11px] tracking-[0.1em] text-mute">ORDER {sent?.code}</p>
          <h2 className="mt-3 font-display text-[38px] leading-tight text-ivory">Sent to {sent?.pharmacy.name}.</h2>
          {sent.status === "PHARMACIST_REVIEW" ? (
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-stone">
              A registered pharmacist will check your prescription against our reading — usually within 15 minutes during
              opening hours. Once it&apos;s approved, you&apos;ll pay from the tracking page.
            </p>
          ) : sent.paymentStatus === "PAID" ? (
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-stone">Paid — the pharmacy is getting your order ready.</p>
          ) : (
            <div className="mx-auto mt-6 max-w-[360px] text-left">
              <p className="mb-4 text-center text-[15px] leading-relaxed text-stone">Nothing here needs a prescription check — pay to confirm your order.</p>
              <PayButton order={sent} autoStart onPaid={setSent} />
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`/track?code=${sent?.code ?? ""}`} className="inline-flex items-center gap-1.5 rounded-[3px] bg-gold px-5 py-3 text-[14px] font-medium text-ink hover:bg-gold-soft">
              Track status <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button onClick={reset} className="rounded-[3px] border border-line px-5 py-3 text-[14px] text-bone hover:border-gold">
              Scan another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
