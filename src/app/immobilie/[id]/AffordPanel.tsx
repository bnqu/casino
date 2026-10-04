"use client";
import { useState } from "react";
import { amortize } from "@/lib/finance/amortization";
import { purchaseCosts, type BrokerArrangement } from "@/lib/finance/purchaseCosts";
import { ownerMonthlyCost } from "@/lib/finance/monthlyCost";
import type { StateCode } from "@/lib/data/regulatory/transferTax";
import { Disclaimer, eur, NumberField } from "@/components/ui";

export function AffordPanel({
  price,
  state,
  hausgeld,
  livingArea,
  propertyType,
  commission,
  rate,
}: {
  price: number;
  state?: StateCode;
  hausgeld?: number;
  livingArea: number;
  propertyType: "apartment" | "house";
  commission?: { buyerPct?: number; commissionFree?: boolean };
  rate: { value: number; source: string; observedAt?: string } | null;
}) {
  const [savings, setSavings] = useState<number | undefined>();
  const [reserve, setReserve] = useState<number | undefined>(20_000);
  const [income, setIncome] = useState<number | undefined>();
  const [ratePct, setRatePct] = useState<number | undefined>(rate ? Math.round(rate.value * 10000) / 100 : undefined);
  if (!state) return <div className="card text-sm text-muted">Bundesland unbekannt — Kaufnebenkosten können nicht berechnet werden.</div>;
  const broker: BrokerArrangement = commission?.commissionFree ? { kind: "none" } : commission?.buyerPct != null ? { kind: "buyer_pct", pct: commission.buyerPct } : { kind: "none" };
  const costs = purchaseCosts({ price, state, broker });
  const equity = savings != null ? Math.max(0, savings - (reserve ?? 0)) : undefined;
  const loan = equity != null ? Math.max(0, costs.totalCashRequirement - equity) : undefined;
  const am = loan != null && ratePct != null ? amortize({ principal: loan, annualRate: ratePct / 100, initialRepayment: 0.02, fixedYears: 10, maxMonths: 12 }) : null;
  const monthly = am ? ownerMonthlyCost({ mortgagePayment: am.monthlyPayment, hausgeld, livingArea, propertyType }) : null;
  const ratio = monthly && income ? monthly.total / income : null;
  const verdict = ratio == null ? null : ratio <= 0.35 && (equity ?? 0) >= costs.closingCosts ? ["Komfortabel", "text-brand"] : ratio <= 0.45 ? ["Grenzwertig", "text-warn"] : ["Hohes Risiko", "text-risk"];
  const row = (l: string, v: string, b = false) => (
    <div className={`flex justify-between py-1 ${b ? "font-semibold" : ""}`}><span>{l}</span><span className="num">{v}</span></div>
  );
  return (
    <section className="card space-y-3 text-sm">
      <h2 className="font-semibold">Kann ich mir das leisten?</h2>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Ersparnisse" value={savings} onChange={setSavings} suffix="€" />
        <NumberField label="Reserve" value={reserve} onChange={setReserve} suffix="€" />
        <NumberField label="Netto / Monat" value={income} onChange={setIncome} suffix="€" />
        <NumberField label="Zins" value={ratePct} onChange={setRatePct} suffix="%" step={0.01} placeholder="eingeben" />
      </div>
      {rate && <p className="text-xs text-muted">Zins vorbelegt: {rate.source}{rate.observedAt && `, Stand ${rate.observedAt}`} — Marktdurchschnitt, kein Angebot.</p>}
      <div className="divide-y divide-line">
        {row("Kaufpreis", eur(price))}
        {row(`Nebenkosten (GrESt ${costs.transferTaxPct}%, Notar, Grundbuch${broker.kind !== "none" ? ", Makler" : ""})`, eur(costs.closingCosts))}
        {row("Gesamtkosten", eur(costs.totalCashRequirement), true)}
        {row("Eigenkapital (ohne Reserve)", equity != null ? eur(equity) : "–")}
        {row("Darlehen", loan != null ? eur(loan) : "–")}
        {row("Kreditrate (2% Tilgung)", am ? eur(am.monthlyPayment) : "–")}
        {row("Wohnkosten gesamt / Monat", monthly ? eur(monthly.total) : "–", true)}
        {row("Verbleibende Liquidität", savings != null ? eur(Math.min(reserve ?? 0, savings)) : "–")}
      </div>
      {verdict && <p>Einschätzung: <b className={verdict[1]}>{verdict[0]}</b> ({Math.round(ratio! * 100)}% des Nettoeinkommens)</p>}
      {!commission && <p className="text-xs text-warn">Provision im Angebot nicht angegeben — hier ohne Makler gerechnet.</p>}
      <Disclaimer>Schätzung, keine Kreditentscheidung. Die tatsächliche Finanzierung hängt von der Prüfung durch die Bank ab.</Disclaimer>
    </section>
  );
}
