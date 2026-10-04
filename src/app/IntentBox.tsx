"use client";
import { useState } from "react";
import Link from "next/link";
import { parseIntent } from "@/lib/intent/parse";
import { eur } from "@/components/ui";

const EXAMPLES = [
  "I have €80,000 savings, earn €5,500 net monthly, want a 3-bedroom apartment around Berlin, and don't want to spend more than €2,000 per month.",
  "I want a 2–3 room apartment within 35 minutes of Munich Hauptbahnhof, maximum warm rent €1,800, balcony, quiet neighborhood, and I have a dog.",
];

export function IntentBox() {
  const [text, setText] = useState("");
  const p = text.trim() ? parseIntent(text) : null;
  const facts: [string, string][] = [];
  if (p) {
    if (p.transaction) facts.push(["Vorhaben", p.transaction === "buy" ? "Kaufen" : "Mieten"]);
    if (p.type) facts.push(["Typ", p.type === "house" ? "Haus" : "Wohnung"]);
    if (p.location) facts.push(["Region", p.location]);
    if (p.minRooms) facts.push(["Zimmer", p.maxRooms ? `${p.minRooms}–${p.maxRooms}` : `${p.minRooms}+`]);
    if (p.bedrooms) facts.push(["Schlafzimmer", `${p.bedrooms}`]);
    if (p.savings) facts.push(["Ersparnisse", eur(p.savings)]);
    if (p.netMonthlyIncome) facts.push(["Netto / Monat", eur(p.netMonthlyIncome)]);
    if (p.maxMonthly) facts.push(["Max. Monatsbudget", eur(p.maxMonthly)]);
    if (p.maxWarmRent) facts.push(["Max. Warmmiete", eur(p.maxWarmRent)]);
    if (p.commuteMaxMin) facts.push(["Pendelzeit", `≤ ${p.commuteMaxMin} min nach ${p.commuteTo}`]);
    if (p.features.length) facts.push(["Ausstattung", p.features.join(", ")]);
    if (p.pets) facts.push(["Haustiere", "ja"]);
    if (p.quiet) facts.push(["Lage", "ruhig"]);
  }
  const tx = p?.transaction ?? "buy";
  const searchQs = new URLSearchParams(
    Object.entries({ tx, city: p?.location, rooms: p?.minRooms, maxWarm: p?.maxWarmRent, monthly: p?.maxMonthly, features: p?.features.join(","), pets: p?.pets ? "1" : undefined })
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );
  const finQs = new URLSearchParams(
    Object.entries({ savings: p?.savings, income: p?.netMonthlyIncome, monthly: p?.maxMonthly }).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
  );
  return (
    <div className="mt-8 text-left">
      <textarea className="input min-h-28 text-base" placeholder="z. B. Ich habe 80.000 € Ersparnisse, verdiene 5.500 € netto und suche eine 3-Zimmer-Wohnung in Berlin für max. 2.000 € im Monat …" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {EXAMPLES.map((e, i) => (
          <button key={i} className="chip bg-white hover:bg-slate-50" onClick={() => setText(e)}>
            Beispiel {i + 1}: {i === 0 ? "Kaufen in Berlin" : "Mieten in München"}
          </button>
        ))}
      </div>
      {p && (
        <div className="card mt-4">
          <div className="label mb-2">So haben wir dich verstanden</div>
          {facts.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">Noch nichts erkannt — nenne z. B. Ort, Zimmer, Budget.</p>
          )}
          {p.unparsed.length > 0 && <p className="mt-2 text-xs text-warn">Unklar: {p.unparsed.join(", ")}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {tx === "buy" && <Link className="btn" href={`/finanzierung?${finQs}`}>Budget & Finanzierung berechnen</Link>}
            <Link className={tx === "buy" ? "btn-ghost" : "btn"} href={`/suche?${searchQs}`}>Passende Angebote suchen</Link>
          </div>
        </div>
      )}
    </div>
  );
}
