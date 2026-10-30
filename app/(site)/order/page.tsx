import type { Metadata } from "next";
import OrderClient from "@/components/OrderClient";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Order medicine" };

export default function OrderPage() {
  return (
    <>
      <section className="border-b border-line-soft">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-6 px-4 pb-10 pt-14 sm:px-8 md:flex-row md:items-end">
          <div>
            <Eyebrow>Order medicine</Eyebrow>
            <h1 className="mt-5 font-display text-[46px] leading-none tracking-[-0.02em] text-ivory sm:text-[64px]">
              From a licensed shelf <em className="text-gold">near you.</em>
            </h1>
          </div>
          <ol className="flex gap-6 font-mono text-[11px] text-mute">
            {["Search", "Prescription", "Pharmacist review", "Delivery"].map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className={i === 0 ? "text-gold" : ""}>{String(i + 1).padStart(2, "0")}</span>
                <span className="hidden sm:inline">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <OrderClient />
    </>
  );
}
