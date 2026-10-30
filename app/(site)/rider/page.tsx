import type { Metadata } from "next";
import RiderClient from "@/components/RiderClient";

export const metadata: Metadata = { title: "Rider" };

export default function RiderPage() {
  return <RiderClient />;
}
