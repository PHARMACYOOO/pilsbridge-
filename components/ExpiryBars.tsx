"use client";

import { useState } from "react";

export type ExpiryMonth = { m: string; units: number; skus: number };

/** Packs reaching expiry per month. `data` comes from live inventory. */
export default function ExpiryBars({ data }: { data: ExpiryMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(...data.map((d) => d.units), 1);
  const max = Math.ceil((top * 1.15) / 5) * 5;
  const peak = data.reduce((a, b, i) => (b.units > data[a].units ? i : a), 0);
  const empty = data.every((d) => d.units === 0);

  return (
    <div>
      <div className="relative flex h-[170px] items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="pointer-events-none absolute left-0 right-0 border-t border-line-soft" style={{ bottom: `${f * 100}%` }} />
        ))}
        {data.map((d, i) => (
          <div
            key={d.m}
            className="relative flex h-full flex-1 cursor-default items-end justify-center"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={`relative w-[56%] max-w-[34px] rounded-t-[4px] transition-colors ${hover === i ? "bg-gold-soft" : "bg-gold"} ${hover !== null && hover !== i ? "opacity-50" : ""}`}
              style={{ height: `${(d.units / max) * 100}%` }}
            />
            {i === peak && hover === null && !empty && (
              <span className="absolute font-mono text-[10.5px] text-bone" style={{ bottom: `calc(${(d.units / max) * 100}% + 6px)` }}>
                {d.units}
              </span>
            )}
            {hover === i && (
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap border border-line bg-ink px-2.5 py-1.5 font-mono text-[11px] shadow-lg"
                style={{ bottom: `calc(${(d.units / max) * 100}% + 8px)` }}
              >
                <span className="text-mute">{d.m}</span> <span className="text-bone">{d.units} pack{d.units === 1 ? "" : "s"}</span>{" "}
                <span className="text-mute">· {d.skus} batch{d.skus === 1 ? "" : "es"}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[2px]">
        {data.map((d) => (
          <span key={d.m} className="flex-1 text-center font-mono text-[10.5px] text-mute">{d.m}</span>
        ))}
      </div>
    </div>
  );
}
