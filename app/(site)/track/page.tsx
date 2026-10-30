import type { Metadata } from "next";
import TrackClient from "@/components/TrackClient";
import { Container, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Track an order" };

export default function TrackPage() {
  return (
    <>
      <section className="border-b border-line-soft">
        <Container className="pb-10 pt-14">
          <Eyebrow>Track an order</Eyebrow>
          <h1 className="mt-5 font-display text-[46px] leading-none tracking-[-0.02em] text-ivory sm:text-[64px]">
            On its way, <em className="text-gold">sealed.</em>
          </h1>
        </Container>
      </section>
      <TrackClient />
    </>
  );
}
