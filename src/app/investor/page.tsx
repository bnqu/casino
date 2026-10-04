"use client";
import { useMemo, useState } from "react";
import { investorAnalysis } from "@/lib/finance/investor";
import { purchaseCosts } from "@/lib/finance/purchaseCosts";
import { STATES, type StateCode } from "@/lib/data/regulatory/transferTax";
import { Disclaimer, eur, NumberField, pct, Select, Stat } from "@/components/ui";

export default function InvestorPage() {
  const [v, setV] = useState({ price: 300_000 as number | undefined, equity: 60_000 as number | undefined, rate: undefined as number | undefined, repay: 2 as number | undefined, fixed: 10 as number | undefined, cold: 1000 as number | undefined, warm: 1250 as number | undefined, vacancy: 3 as number | undefined, hausgeld: 280 as number | undefined, nonRecoverable: 90 as number | undefined, maint: 900 as number | undefined, mgmt: 360 as number | undefined, tax: 0 as number | undefined, ins: 0 as number | undefined, reno: 0 as number | undefined, appr: 1.5 as number | undefined, rentGrowth: 1.5 as number | undefined, sell: 5 as number | undefined });
  const [state, setState] = useState<StateCode>("DE-NW");
  const set = (k: keyof typeof v) => (x: number | undefined) => setV({ ...v, [k]: x });
  const r = useMemo(() => {
    if (!v.price || v.rate == null || !v.cold) return null;
    const closing = purchaseCosts({ price: v.price, state, broker: { kind: "none" } }).closingCosts;
    return investorAnalysis({ price: v.price, closingCosts: closing, renovation: v.reno ?? 0, equity: v.equity ?? 0, annualRate: v.rate / 100, initialRepayment: (v.repay ?? 2) / 100, fixedYears: v.fixed ?? 10, coldRentMonthly: v.cold, vacancyRate: (v.vacancy ?? 0) / 100, nonRecoverableHausgeldMonthly: v.nonRecoverable ?? 0, maintenanceYearly: v.maint ?? 0, managementYearly: v.mgmt ?? 0, propertyTaxNonRecoverableYearly: v.tax ?? 0, insuranceNonRecoverableYearly: v.ins ?? 0, appreciation: (v.appr ?? 0) / 100, rentGrowth: (v.rentGrowth ?? 0) / 100, sellingCostPct: (v.sell ?? 0) / 100 });
  }, [v, state]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Investor-Modus</h1>
      <p className="mt-1 text-muted">Renditekennzahlen vor Steuern für vermietete Wohnimmobilien.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="card grid grid-cols-2 content-start gap-3">
          <NumberField label="Kaufpreis" value={v.price} onChange={set("price")} suffix="€" step={5000} />
          <Select label="Bundesland" value={state} onChange={setState} options={Object.entries(STATES) as [StateCode, string][]} />
          <NumberField label="Eigenkapital" value={v.equity} onChange={set("equity")} suffix="€" />
          <NumberField label="Renovierung" value={v.reno} onChange={set("reno")} suffix="€" />
          <NumberField label="Zins" value={v.rate} onChange={set("rate")} suffix="%" step={0.01} placeholder="eingeben" />
          <NumberField label="Tilgung" value={v.repay} onChange={set("repay")} suffix="%" step={0.1} />
          <NumberField label="Kaltmiete / Monat" value={v.cold} onChange={set("cold")} suffix="€" />
          <NumberField label="Warmmiete / Monat" value={v.warm} onChange={set("warm")} suffix="€" hint="Nur zur Info — Rendite rechnet mit Kaltmiete." />
          <NumberField label="Leerstand" value={v.vacancy} onChange={set("vacancy")} suffix="%" step={0.5} />
          <NumberField label="Hausgeld gesamt" value={v.hausgeld} onChange={set("hausgeld")} suffix="€" />
          <NumberField label="davon nicht umlegbar" value={v.nonRecoverable} onChange={set("nonRecoverable")} suffix="€" />
          <NumberField label="Instandhaltung / Jahr" value={v.maint} onChange={set("maint")} suffix="€" />
          <NumberField label="Verwaltung / Jahr" value={v.mgmt} onChange={set("mgmt")} suffix="€" />
          <NumberField label="Grundsteuer n. uml." value={v.tax} onChange={set("tax")} suffix="€" />
          <NumberField label="Versicherung n. uml." value={v.ins} onChange={set("ins")} suffix="€" />
          <NumberField label="Wertentwicklung" value={v.appr} onChange={set("appr")} suffix="%" step={0.1} min={-5} />
          <NumberField label="Mietsteigerung" value={v.rentGrowth} onChange={set("rentGrowth")} suffix="%" step={0.1} />
          <NumberField label="Verkaufskosten" value={v.sell} onChange={set("sell")} suffix="%" step={0.5} />
        </aside>
        <div className="space-y-6">
          {!r && <div className="card text-muted">Gib Zinssatz und Miete ein.</div>}
          {r && (
            <>
              <section className="card grid gap-6 sm:grid-cols-4">
                <Stat label="Bruttomietrendite" value={pct(r.grossYield, 2)} />
                <Stat label="Nettomietrendite" value={pct(r.netYield, 2)} sub="auf Gesamtinvestition" />
                <Stat label="Cashflow / Monat" value={eur(r.cashFlowMonthly)} tone={r.cashFlowMonthly >= 0 ? "good" : "risk"} />
                <Stat label="Eigenkapitalrendite (Cash)" value={r.cashOnCash == null ? "–" : pct(r.cashOnCash, 1)} />
                <Stat label="Mieteinnahmen n. Leerstand" value={eur(r.vacancyAdjustedIncome)} sub="pro Jahr" />
                <Stat label="Bewirtschaftung" value={eur(r.operatingCosts)} sub="pro Jahr" />
                <Stat label="Kapitaldienst" value={eur(r.debtService)} sub={`Zins ${eur(r.interestYear1)} · Tilgung ${eur(r.principalYear1)}`} />
                <Stat label="Gesamtinvestition" value={eur(r.totalCost)} sub={`Darlehen ${eur(r.loan)}`} />
              </section>
              <section className="card">
                <h2 className="mb-2 font-semibold">Szenarien</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr><th>Horizont</th><th className="text-right">Kum. Cashflow</th><th className="text-right">Immobilienwert</th><th className="text-right">Restschuld</th><th className="text-right">Eigenkapital bei Verkauf</th><th className="text-right">Gesamtergebnis</th></tr>
                  </thead>
                  <tbody className="num">
                    {r.scenarios.map((s) => (
                      <tr key={s.years} className="border-t border-line">
                        <td className="py-1.5">{s.years} Jahre</td>
                        <td className="text-right">{eur(s.cumulativeCashFlow)}</td>
                        <td className="text-right">{eur(s.propertyValue)}</td>
                        <td className="text-right">{eur(s.loanBalance)}</td>
                        <td className="text-right">{eur(s.equityAtExit)}</td>
                        <td className="text-right font-medium">{eur(s.totalReturn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">Bewirtschaftungskosten +2% p.a. angenommen. Gesamtergebnis = Eigenkapital bei Verkauf + kumulierter Cashflow − eingesetztes Eigenkapital.</p>
              </section>
              <Disclaimer>{r.taxNote}</Disclaimer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
