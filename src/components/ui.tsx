"use client";
import { useId, useState } from "react";
import type { Provenance } from "@/lib/data/provenance";

export const eur = (x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? "–" : x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (x: number | null | undefined, digits = 1) => (x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`);

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  max,
  slider,
  placeholder,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  slider?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input num pr-10"
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted">{suffix}</span>}
      </div>
      {slider && max != null && (
        <input aria-label={label} type="range" className="w-full accent-[var(--color-brand)]" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} />
      )}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Why({ children, label = "Warum?" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button" className="ml-1 text-xs font-medium text-brand underline decoration-dotted" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
      </button>
      {open && <span className="absolute left-0 top-6 z-50 block w-72 rounded-lg border border-line bg-white p-3 text-xs font-normal normal-case tracking-normal text-ink shadow-lg">{children}</span>}
    </span>
  );
}

export function SourceNote({ p, freshness }: { p: Provenance; freshness?: string }) {
  return (
    <p className="text-xs text-muted">
      Quelle: {p.sourceUrl ? <a className="underline" href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceName}</a> : p.sourceName}
      {p.observedAt && <> · Stand {p.observedAt}</>}
      {freshness && <> · {freshness}</>}
      {p.confidence && <> · Konfidenz {p.confidence}</>}
      {p.disclaimer && <> · {p.disclaimer}</>}
    </p>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "risk" }) {
  const color = tone === "good" ? "text-brand" : tone === "warn" ? "text-warn" : tone === "risk" ? "text-risk" : "";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`num text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{children}</p>;
}
