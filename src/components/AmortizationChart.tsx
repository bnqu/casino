"use client";
import { useState } from "react";
import type { ScheduleRow } from "@/lib/finance/amortization";
import { eur } from "./ui";

/** Yearly balance line plus stacked interest/principal bars. Pure SVG. */
export function AmortizationChart({ schedule, fixedYears, principal }: { schedule: ScheduleRow[]; fixedYears: number; principal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const years: { y: number; balance: number; interest: number; principal: number }[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const rows = schedule.slice(i, i + 12);
    years.push({ y: i / 12 + 1, balance: rows[rows.length - 1].balance, interest: rows.reduce((s, r) => s + r.interest, 0), principal: rows.reduce((s, r) => s + r.principal + r.special, 0) });
  }
  if (!years.length) return null;
  const W = 640, H = 220, pad = 36;
  const n = years.length;
  const bw = (W - pad * 2) / n;
  const maxBar = Math.max(...years.map((y) => y.interest + y.principal));
  const x = (i: number) => pad + i * bw;
  const yB = (v: number) => H - pad - (v / principal) * (H - pad * 2);
  const yA = (v: number) => H - pad - (v / maxBar) * (H - pad * 2) * 0.45;
  const h = hover != null ? years[hover] : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tilgungsverlauf" onMouseLeave={() => setHover(null)}>
        {years.map((d, i) => (
          <g key={d.y} onMouseEnter={() => setHover(i)}>
            <rect x={x(i)} y={0} width={bw} height={H} fill="transparent" />
            <rect x={x(i) + 1} y={yA(d.interest)} width={Math.max(bw - 2, 1)} height={H - pad - yA(d.interest)} fill="#fca5a5" />
            <rect x={x(i) + 1} y={yA(d.interest + d.principal)} width={Math.max(bw - 2, 1)} height={yA(d.interest) - yA(d.interest + d.principal)} fill="#5eead4" />
          </g>
        ))}
        <polyline fill="none" stroke="#0f766e" strokeWidth={2.5} points={[`${pad},${yB(principal)}`, ...years.map((d, i) => `${x(i) + bw},${yB(d.balance)}`)].join(" ")} />
        {fixedYears <= n && <line x1={x(fixedYears)} x2={x(fixedYears)} y1={pad / 2} y2={H - pad} stroke="#b45309" strokeDasharray="4 4" />}
        {fixedYears <= n && (
          <text x={x(fixedYears) + 4} y={pad / 2 + 10} fontSize={10} fill="#b45309">
            Ende Zinsbindung
          </text>
        )}
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#cbd5e1" />
        {years.filter((d) => d.y % 5 === 0).map((d) => (
          <text key={d.y} x={x(d.y - 1) + bw / 2} y={H - pad + 14} fontSize={10} textAnchor="middle" fill="#64748b">
            {d.y}
          </text>
        ))}
        <text x={pad} y={pad / 2} fontSize={10} fill="#64748b">
          Restschuld
        </text>
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span><span className="inline-block h-2 w-3 bg-[#0f766e]" /> Restschuld</span>
        <span><span className="inline-block h-2 w-3 bg-[#5eead4]" /> Tilgung / Jahr</span>
        <span><span className="inline-block h-2 w-3 bg-[#fca5a5]" /> Zinsen / Jahr</span>
        {h && (
          <span className="num text-ink">
            Jahr {h.y}: Restschuld {eur(h.balance)} · Tilgung {eur(h.principal)} · Zinsen {eur(h.interest)}
          </span>
        )}
      </div>
    </div>
  );
}
