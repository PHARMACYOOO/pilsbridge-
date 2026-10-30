"use client";

import { useState } from "react";

// Sample shipment log: one reading every 10 minutes.
const readings = [4.2, 4.5, 4.8, 5.1, 5.0, 4.7, 5.3, 6.1, 6.9, 7.6, 8.4, 8.9, 8.1, 6.8, 5.6, 5.2, 4.9, 5.1];
const start = 9 * 60 + 20; // 09:20

const W = 560;
const H = 220;
const pad = { l: 36, r: 12, t: 14, b: 26 };
const yMin = 0;
const yMax = 12;
const x = (i: number) => pad.l + (i / (readings.length - 1)) * (W - pad.l - pad.r);
const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
const clock = (i: number) => {
  const m = start + i * 10;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default function TempChart() {
  const [hover, setHover] = useState<number | null>(null);
  const path = readings.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Shipment temperature over three hours; readings exceeded 8 °C between 11:00 and 11:20"
        onMouseLeave={() => setHover(null)}
      >
        {/* safe band 2–8 °C */}
        <rect x={pad.l} y={y(8)} width={W - pad.l - pad.r} height={y(2) - y(8)} fill="var(--color-cold)" opacity="0.08" />
        {[0, 2, 4, 6, 8, 10, 12].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line-soft)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" className="fill-mute font-mono text-[10px]">{t}°</text>
          </g>
        ))}
        {[2, 8].map((t) => (
          <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-cold)" strokeOpacity="0.5" strokeDasharray="3 4" />
        ))}
        <text x={W - pad.r} y={y(8) - 5} textAnchor="end" className="fill-cold font-mono text-[10px]">8 °C limit</text>

        {[0, 6, 12, 17].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-mute font-mono text-[10px]">{clock(i)}</text>
        ))}

        <path d={path} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {readings.map((v, i) =>
          v > 8 ? <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="var(--color-alert)" stroke="var(--color-ink)" strokeWidth="2" /> : null,
        )}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-stone)" strokeOpacity="0.5" />
            <circle cx={x(hover)} cy={y(readings[hover])} r="4.5" fill="var(--color-ink)" stroke="var(--color-gold-soft)" strokeWidth="2" />
          </g>
        )}

        {readings.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - pad.l - pad.r) / (readings.length - 1) / 2}
            y={pad.t}
            width={(W - pad.l - pad.r) / (readings.length - 1)}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 border border-line bg-ink px-2.5 py-1.5 font-mono text-[11px] shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <span className="text-mute">{clock(hover)}</span>{" "}
          <span className={readings[hover] > 8 ? "text-alert" : "text-bone"}>{readings[hover].toFixed(1)} °C</span>
        </div>
      )}
    </div>
  );
}
