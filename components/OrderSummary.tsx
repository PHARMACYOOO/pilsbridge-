import { Snowflake } from "lucide-react";
import { Badge } from "./ui";
import { formatKobo, type ApiQuote } from "@/lib/api";
import type { Product } from "@/lib/catalog";
import type { LiveDelivery } from "@/lib/delivery";

export function ClassBadge({ p }: { p: Product }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {p.classification === "OTC" && <Badge tone="otc">OTC</Badge>}
      {p.classification === "POM" && <Badge tone="pom">Rx required</Badge>}
      {p.classification === "Device" && <Badge tone="device">Device</Badge>}
      {p.coldChain && (
        <Badge tone="cold">
          <Snowflake className="h-2.5 w-2.5" /> 2–8 °C
        </Badge>
      )}
    </span>
  );
}

/** Subtotal, delivery, service fee and total for the chosen pharmacy. */
export function OrderTotals({ quote, live, deliveryKobo, totalKobo, estimate }: { quote: ApiQuote; live: LiveDelivery | null; deliveryKobo: number; totalKobo: number; estimate?: boolean }) {
  return (
    <dl className="space-y-2 text-[13.5px]">
      <div className="flex justify-between text-stone"><dt>Subtotal</dt><dd>{formatKobo(quote.subtotalKobo)}</dd></div>
      <div className="flex justify-between text-stone">
        <dt>
          Delivery
          {live?.source === "courier" ? <span className="text-mute"> · live price to your pin</span> : estimate && <span className="text-mute"> · estimate</span>}
        </dt>
        <dd>{formatKobo(deliveryKobo)}</dd>
      </div>
      <div className="flex justify-between text-stone"><dt>Service fee</dt><dd>{formatKobo(quote.serviceKobo)}</dd></div>
      <div className="flex justify-between border-t border-line-soft pt-3 text-[15px] text-ivory">
        <dt>Total</dt>
        <dd className="font-medium">{formatKobo(totalKobo)}</dd>
      </div>
    </dl>
  );
}
