"use client";

import { RotateCw } from "lucide-react";
import { Badge } from "@/components/ui";
import type { ApiTransfer } from "@/lib/api";
import { shortDate, useList } from "./shared";

/** Every transfer past draft, for oversight. Pharmacies approve and move stock themselves. */
export default function Transfers() {
  const { items, error, load } = useList<Omit<ApiTransfer, "direction" | "blocked">>("/admin/transfers");
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] text-stone">Stock moving between pharmacies. A pharmacist approves at each end; nothing here needs action from Pilbridge.</p>
        <button onClick={load} className="p-1 text-mute hover:text-gold" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
      <div className="mt-4 space-y-2">
        {items === null && !error && <p className="text-[13px] text-mute">Loading…</p>}
        {items?.length === 0 && <p className="text-[13px] text-mute">No transfers yet.</p>}
        {items?.map((t) => (
          <div key={t.id} className="border border-line bg-coal p-4">
            <p className="flex flex-wrap items-center gap-2 text-[14px] text-bone">
              {t.product.name} × {t.quantity}
              <Badge tone={t.status === "RECEIVED" ? "ok" : ["DECLINED", "CANCELLED"].includes(t.status) ? "neutral" : "warn"}>{t.status.replace("_", " ").toLowerCase()}</Badge>
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-mute">
              {t.code} · {t.fromPharmacy.name} → {t.toPharmacy?.name ?? "open to network"} · batch {t.batch.batchNumber} · updated {shortDate(t.updatedAt)}
            </p>
            {t.closeReason && <p className="mt-1 text-[12.5px] text-mute">{t.closeReason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
