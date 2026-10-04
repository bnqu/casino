"use client";
import { useMemo, useState } from "react";
import { rentVsBuy, RVB_SCENARIOS } from "@/lib/finance/rentVsBuy";
import { purchaseCosts } from "@/lib/finance/purchaseCosts";
import { STATES, type StateCode } from "@/lib/data/regulatory/transferTax";
import { Disclaimer, eur, NumberField, Select } from "@/components/ui";

type Scenario = keyof typeof RVB_SCENARIOS;
const LABEL: Record<Scenario, string> = { conservative: "Konservativ", base: "Basis", optimistic: "Optimistisch" };

export default function RentVsBuyPage() {
  const [rent, setRent] = useState<number | undefined>(1500);
  const [price, setPrice] = useState<number | undefined>(450_000);
  const [state, setState] = useState<StateCode>("DE-BE");
  const [equity, setEquity] = useState<number | undefined>(120_000);
  const [rate, setRate] = useState<number | undefined>();
  const [repay, setRepay] = useState<number | undefined>(2);
  const [hausgeld, setHausgeld] = useState<number | undefined>(250);
  const [tax, setTax] = useState<number | undefined>(400);
  const [ins, setIns] = useState<number | undefined>(0);
  const [maint, setMaint] = useState<number | undefined>(1);
  const [sell, setSell] = useState<number | undefined>(5);
  const [overrides, setOverrides] = useState<Partial<Record<"appreciation" | "investmentReturn" | "rentIncrease", number>>>({});

  const results = useMemo(() => {
    if (!rent || !price || equity == null || rate == null || repay == null) return null;
    const closing = purchaseCosts({ price, state, broker: { kind: "none" } }).closingCosts;
    return (Object.keys(RVB_SCENARIOS) as Scenario[]).map((s) => {
      const sc = { ...RVB_SCENARIOS[s], ...(s === "base" ? overrides : {}) };
      return { s, sc, r: rentVsBuy({ monthlyRent: rent, rentIncrease: sc.rentIncrease, price, closingCosts: closing, equity, annualRate: rate / 100, initialRepayment: repay / 100, fixedYears: 10, investmentReturn: sc.investmentReturn, appreciation: sc.appreciation, maintenancePctOfPrice: (maint ?? 1) / 100, hausgeldMonthly: hausgeld ?? 0, propertyTaxYearly: tax ?? 0, insuranceYearly: ins ?? 0, sellingCostPct: (sell ?? 0) / 100, years: 30 }) };
    });
  }, [rent, price, state, equity, rate, repay, hausgeld, tax, ins, maint, sell, overrides]);

  const base = results?.find((x) => x.s === "base");
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Mieten oder kaufen?</h1>
      <p className="mt-1 text-muted">Vermögensvergleich: Der Mieter legt das Eigenkapital und jede monatliche Ersparnis an. Wertsteigerung ist ein Szenario, keine Prognose.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="card grid grid-cols-2 content-start gap-3">
          <NumberField label="Aktuelle Kaltmiete+NK" value={rent} onChange={setRent} suffix="€" />
          <NumberField label="Kaufpreis" value={price} onChange={setPrice} suffix="€" step={5000} />
          <div className="col-span-2"><Select label="Bundesland" value={state} onChange={setState} options={Object.entries(STATES) as [StateCode, string][]} /></div>
          <NumberField label="Eigenkapital" value={equity} onChange={setEquity} suffix="€" />
          <NumberField label="Zins" value={rate} onChange={setRate} suffix="%" step={0.01} placeholder="eingeben" />
          <NumberField label="Tilgung" value={repay} onChange={setRepay} suffix="%" step={0.1} />
          <NumberField label="Hausgeld (nicht umlegbar)" value={hausgeld} onChange={setHausgeld} suffix="€" />
          <NumberField label="Grundsteuer / Jahr" value={tax} onChange={setTax} suffix="€" />
          <NumberField label="Versicherung / Jahr" value={ins} onChange={setIns} suffix="€" />
          <NumberField label="Instandhaltung % p.a." value={maint} onChange={setMaint} suffix="%" step={0.1} />
          <NumberField label="Verkaufskosten" value={sell} onChange={setSell} suffix="%" step={0.5} />
          <div className="col-span-2 border-t border-line pt-3 text-xs font-semibold">Basis-Szenario anpassen</div>
          <NumberField label="Mietsteigerung" value={(overrides.rentIncrease ?? RVB_SCENARIOS.base.rentIncrease) * 100} onChange={(v) => setOverrides({ ...overrides, rentIncrease: (v ?? 0) / 100 })} suffix="%" step={0.1} />
          <NumberField label="Wertentwicklung" value={(overrides.appreciation ?? RVB_SCENARIOS.base.appreciation) * 100} onChange={(v) => setOverrides({ ...overrides, appreciation: (v ?? 0) / 100 })} suffix="%" step={0.1} min={-5} />
          <NumberField label="Rendite Geldanlage" value={(overrides.investmentReturn ?? RVB_SCENARIOS.base.investmentReturn) * 100} onChange={(v) => setOverrides({ ...overrides, investmentReturn: (v ?? 0) / 100 })} suffix="%" step={0.1} />
          <p className="col-span-2 text-xs text-muted">Kaufnebenkosten ohne Makler. Haltedauer 30 Jahre, Zins nach Zinsbindung unverändert angenommen.</p>
        </aside>
        <div className="space-y-6">
          {!results && <div className="card text-muted">Gib einen Zinssatz ein, um zu vergleichen.</div>}
          {base && (
            <section className="card">
              <p className="text-lg">
                {base.r.breakEvenYears
                  ? <>Nach deinen Annahmen wird Kaufen nach ca. <b>{base.r.breakEvenYears.toFixed(1)} Jahren</b> finanziell vergleichbar mit Mieten.</>
                  : <>Nach deinen Annahmen holt Kaufen das Mieten innerhalb von 30 Jahren <b>nicht</b> ein.</>}
              </p>
            </section>
          )}
          {results && (
            <section className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th>Szenario</th>
                    {[5, 10, 20].map((y) => (
                      <th key={y} className="text-right" colSpan={2}>{y} Jahre (Mieten / Kaufen)</th>
                    ))}
                    <th className="text-right">Break-even</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {results.map(({ s, sc, r }) => (
                    <tr key={s} className="border-t border-line">
                      <td className="py-2">
                        <b>{LABEL[s]}</b>
                        <div className="text-xs text-muted">Wert {(sc.appreciation * 100).toFixed(1)}% · Miete {(sc.rentIncrease * 100).toFixed(1)}% · Anlage {(sc.investmentReturn * 100).toFixed(1)}%</div>
                      </td>
                      {[5, 10, 20].map((y) => {
                        const row = r.rows[y - 1];
                        return [
                          <td key={`${y}r`} className={`text-right ${row.renterNetWorth >= row.buyerNetWorth ? "font-semibold" : ""}`}>{eur(row.renterNetWorth)}</td>,
                          <td key={`${y}b`} className={`text-right ${row.buyerNetWorth > row.renterNetWorth ? "font-semibold" : ""}`}>{eur(row.buyerNetWorth)}</td>,
                        ];
                      })}
                      <td className="text-right">{r.breakEvenYears ? `${r.breakEvenYears.toFixed(1)} J.` : "> 30 J."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">Nettovermögen: Mieter = angelegtes Kapital. Käufer = Immobilienwert abzgl. Verkaufskosten und Restschuld, plus angelegte Differenz, falls Eigentum günstiger ist als Miete.</p>
            </section>
          )}
          <Disclaimer>Szenarien, keine Vorhersage. Wertsteigerungen sind nicht garantiert; Steuern (z. B. auf Kapitalerträge) sind nicht berücksichtigt.</Disclaimer>
        </div>
      </div>
    </div>
  );
}
