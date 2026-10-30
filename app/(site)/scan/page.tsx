import type { Metadata } from "next";
import ScanClient from "@/components/ScanClient";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Snap a prescription" };

export default function ScanPage() {
  return (
    <>
      <section className="border-b border-line-soft">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-6 px-4 pb-10 pt-14 sm:px-8 md:flex-row md:items-end">
          <div>
            <Eyebrow>Snap a prescription</Eyebrow>
            <h1 className="mt-5 font-display text-[46px] leading-none tracking-[-0.02em] text-ivory sm:text-[64px]">
              Photograph it. <em className="text-gold">We&apos;ll total it.</em>
            </h1>
          </div>
          <p className="max-w-[40ch] text-[14px] leading-relaxed text-stone">
            An instant estimate from your paper prescription — confirmed by a registered pharmacist before anything is
            dispensed.
          </p>
        </div>
      </section>
      <ScanClient />
    </>
  );
}
