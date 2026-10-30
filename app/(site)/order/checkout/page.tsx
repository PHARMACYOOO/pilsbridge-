import type { Metadata } from "next";
import CheckoutClient from "@/components/CheckoutClient";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <>
      <section className="border-b border-line-soft">
        <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-14 sm:px-8">
          <Eyebrow>Checkout</Eyebrow>
          <h1 className="mt-5 font-display text-[46px] leading-none tracking-[-0.02em] text-ivory sm:text-[64px]">
            Where should we <em className="text-gold">deliver?</em>
          </h1>
        </div>
      </section>
      <CheckoutClient />
    </>
  );
}
