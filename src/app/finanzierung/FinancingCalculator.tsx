"use client";
import { useMemo, useState } from "react";
import { amortize, refinanceScenarios, snapshotAt, type LoanInput } from "@/lib/finance/amortization";
import { purchaseCosts, type BrokerArrangement } from "@/lib/finance/purchaseCosts";
import { assessAffordability, priceFromMonthlyBudget, DEFAULT_AFFORDABILITY_CONFIG } from "@/lib/finance/affordability";
import { ltvInfo, ownerMonthlyCost } from "@/lib/finance/monthlyCost";
import { STATES, TRANSFER_TAX_EXPLANATION, transferTaxRule, type StateCode } from "@/lib/data/regulatory/transferTax";
import { BROKER_SPLIT_RULE } from "@/lib/data/regulatory/acquisitionRules";
import { matchPrograms, PROGRAM_CATALOGUE } from "@/lib/data/providers/governmentPrograms";
import type { ProviderResult } from "@/lib/data/provenance";
import type { IndicativeRate } from "@/lib/data/providers/types";
import { AmortizationChart } from "@/components/AmortizationChart";
import { Disclaimer, eur, NumberField, pct, Select, SourceNote, Stat, Why } from "@/components/ui";

type BrokerKind = BrokerArrangement["kind"];
const SNAP_YEARS = [1, 5, 10, 15, 20, 25, 30];

export function FinancingCalculator({
  rate,
  initial,
}: {
  rate: ProviderResult<IndicativeRate>;
  initial: { price?: number; savings?: number; netIncome?: number; state?: string; monthlyBudget?: number };
}) {
  // Property
  const [price, setPrice] = useState<number | undefined>(initial.price ?? 450_000);
  const [state, setState] = useState<StateCode>(initial.state && initial.state in STATES ? (initial.state as StateCode) : "DE-BE");
  const [propertyType, setPropertyType] = useState<"apartment" | "house">("apartment");
  const [newBuild, setNewBuild] = useState<"existing" | "new">("existing");
  const [usage, setUsage] = useState<"owner" | "investment">("owner");
  const [area, setArea] = useState<number | undefined>(80);
  const [hausgeld, setHausgeld] = useState<number | undefined>();
  const [propertyTax, setPropertyTax] = useState<number | undefined>();
  const [energyClass, setEnergyClass] = useState<string>("");
  const [renovation, setRenovation] = useState<number | undefined>(0);
  // Broker
  const [brokerKind, setBrokerKind] = useState<BrokerKind>("split");
  const [brokerPct, setBrokerPct] = useState<number | undefined>(7.14);
  const [brokerFixed, setBrokerFixed] = useState<number | undefined>();
  // Equity
  const [savings, setSavings] = useState<number | undefined>(initial.savings ?? 100_000);
  const [reserve, setReserve] = useState<number | undefined>(20_000);
  const [gift, setGift] = useState<number | undefined>(0);
  // Income / expenses
  const [netIncome, setNetIncome] = useState<number | undefined>(initial.netIncome ?? 5_000);
  const [partnerIncome, setPartnerIncome] = useState<number | undefined>(0);
  const [rentalIncome, setRentalIncome] = useState<number | undefined>(0);
  const [otherIncome, setOtherIncome] = useState<number | undefined>(0);
  const [taxableIncome, setTaxableIncome] = useState<number | undefined>();
  const [obligations, setObligations] = useState<number | undefined>(0);
  const [adults, setAdults] = useState<number | undefined>(1);
  const [children, setChildren] = useState<number | undefined>(0);
  const [employment, setEmployment] = useState<"employed" | "self_employed" | "civil_servant">("employed");
  // Financing — rate is never invented: benchmark prefill only if a provider returned one.
  const [ratePct, setRatePct] = useState<number | undefined>(rate.ok ? Math.round(rate.value.annualRate * 10000) / 100 : undefined);
  const [repayPct, setRepayPct] = useState<number | undefined>(2);
  const [fixedYears, setFixedYears] = useState<number | undefined>(10);
  const [special, setSpecial] = useState<number | undefined>(0);
  const [useKfw, setUseKfw] = useState(false);
  const [kfwAmount, setKfwAmount] = useState<number | undefined>();
  const [kfwRate, setKfwRate] = useState<number | undefined>();
  const [kfwRepay, setKfwRepay] = useState<number | undefined>(2);
  // What-if
  const [wPrice, setWPrice] = useState(0);
  const [wRate, setWRate] = useState<number | null>(null);
  const [wEquity, setWEquity] = useState<number | null>(null);
  const [wReno, setWReno] = useState<number | null>(null);

  const broker: BrokerArrangement =
    brokerKind === "none" ? { kind: "none" } : brokerKind === "fixed" ? { kind: "fixed", amount: brokerFixed ?? 0 } : brokerKind === "split" ? { kind: "split", totalPct: brokerPct ?? 0 } : { kind: "buyer_pct", pct: brokerPct ?? 0 };

  const rule = transferTaxRule(state);
  const cash = (savings ?? 0) + (gift ?? 0);
  const equity = Math.max(0, cash - Math.min(reserve ?? 0, cash));

  const calc = useMemo(() => {
    if (!price || ratePct == null || repayPct == null || !fixedYears) return null;
    const run = (p: number, r: number, eq: number, reno: number) => {
      const costs = purchaseCosts({ price: p, state, broker, renovation: reno });
      const kfw = useKfw && kfwAmount && kfwRate != null ? Math.min(kfwAmount, Math.max(0, costs.totalCashRequirement - eq)) : 0;
      const bankLoan = Math.max(0, costs.totalCashRequirement - eq - kfw);
      const loan: LoanInput = { principal: bankLoan, annualRate: r / 100, initialRepayment: repayPct / 100, fixedYears, annualSpecialRepayment: special || undefined };
      const am = amortize(loan);
      const kfwAm = kfw ? amortize({ principal: kfw, annualRate: (kfwRate ?? 0) / 100, initialRepayment: (kfwRepay ?? 2) / 100, fixedYears }) : null;
      const payment = am.monthlyPayment + (kfwAm?.monthlyPayment ?? 0);
      const running = ownerMonthlyCost({ mortgagePayment: payment, hausgeld, livingArea: area ?? 0, propertyTaxYearly: propertyTax, propertyType });
      return { costs, loan, am, kfw, kfwAm, payment, running, totalLoan: bankLoan + kfw };
    };
    const base = run(price, ratePct, equity, renovation ?? 0);
    const refi = refinanceScenarios(base.loan);
    const what = run(price * (1 + wPrice / 100), wRate ?? ratePct, wEquity ?? equity, wReno ?? renovation ?? 0);
    const income = (netIncome ?? 0) + (partnerIncome ?? 0) + (otherIncome ?? 0) + (rentalIncome ?? 0) * 0.7;
    const ratio = income ? (base.running.total + (obligations ?? 0)) / income : 1;
    return { ...base, refi, what, ratio, income };
  }, [price, ratePct, repayPct, fixedYears, state, broker.kind, brokerPct, brokerFixed, equity, renovation, special, useKfw, kfwAmount, kfwRate, kfwRepay, hausgeld, area, propertyTax, propertyType, wPrice, wRate, wEquity, wReno, netIncome, partnerIncome, otherIncome, rentalIncome, obligations]); // eslint-disable-line react-hooks/exhaustive-deps

  const afford = useMemo(() => {
    if (ratePct == null || repayPct == null || !netIncome) return null;
    return assessAffordability(
      { netMonthlyIncome: netIncome, partnerNetMonthlyIncome: partnerIncome, rentalIncome, otherIncome, adults: adults ?? 1, children: children ?? 0, monthlyObligations: obligations ?? 0, savings: savings ?? 0, giftContribution: gift, desiredReserve: reserve ?? 0, employment },
      { annualRate: ratePct / 100, initialRepayment: repayPct / 100, state, broker: broker.kind === "fixed" ? { kind: "none" } : broker },
    );
  }, [ratePct, repayPct, netIncome, partnerIncome, rentalIncome, otherIncome, adults, children, obligations, savings, gift, reserve, employment, state, broker.kind, brokerPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const programs = matchPrograms(PROGRAM_CATALOGUE, { ownerOccupied: usage === "owner", children: children ?? 0, newBuild: newBuild === "new", energyClass: energyClass || undefined, householdTaxableIncome: taxableIncome });
  const riskTone = (r: string) => (r === "comfortable" ? "good" : r === "borderline" ? "warn" : "risk");
  const riskLabel = { comfortable: "Komfortabel", borderline: "Grenzwertig", high_risk: "Hohes Risiko" } as const;
  const ltv = calc ? ltvInfo(calc.totalLoan, price ?? 0) : null;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* INPUTS */}
      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold">Immobilie</h2>
          <NumberField label="Kaufpreis" value={price} onChange={setPrice} suffix="€" step={5000} min={50_000} max={2_000_000} slider />
          <div className="flex flex-wrap gap-1">
            {[250_000, 400_000, 550_000, 750_000, 1_000_000].map((p) => (
              <button key={p} className="chip hover:bg-slate-50" onClick={() => setPrice(p)}>
                {eur(p)}
              </button>
            ))}
          </div>
          <Select label="Bundesland" value={state} onChange={setState} options={Object.entries(STATES) as [StateCode, string][]} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Typ" value={propertyType} onChange={setPropertyType} options={[["apartment", "Wohnung"], ["house", "Haus"]]} />
            <Select label="Baujahr" value={newBuild} onChange={setNewBuild} options={[["existing", "Bestand"], ["new", "Neubau"]]} />
            <Select label="Nutzung" value={usage} onChange={setUsage} options={[["owner", "Eigennutzung"], ["investment", "Kapitalanlage"]]} />
            <NumberField label="Wohnfläche" value={area} onChange={setArea} suffix="m²" />
            {propertyType === "apartment" && <NumberField label="Hausgeld / Monat" value={hausgeld} onChange={setHausgeld} suffix="€" placeholder="unbekannt" />}
            <NumberField label="Grundsteuer / Jahr" value={propertyTax} onChange={setPropertyTax} suffix="€" placeholder="unbekannt" />
            <Select label="Energieklasse" value={energyClass} onChange={setEnergyClass} options={[["", "unbekannt"], ...["A+", "A", "B", "C", "D", "E", "F", "G", "H"].map((c) => [c, c] as [string, string])]} />
            <NumberField label="Renovierung" value={renovation} onChange={setRenovation} suffix="€" step={5000} />
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">
            Makler <Why>{BROKER_SPLIT_RULE.value.summary} Prüfe die Regelung im konkreten Exposé bzw. Maklervertrag.</Why>
          </h2>
          <Select label="Provision" value={brokerKind} onChange={setBrokerKind} options={[["none", "Keine / provisionsfrei"], ["split", "Teilung Käufer/Verkäufer"], ["buyer_pct", "Käufer zahlt %"], ["fixed", "Fester Betrag"]]} />
          {(brokerKind === "split" || brokerKind === "buyer_pct") && <NumberField label={brokerKind === "split" ? "Gesamtprovision inkl. MwSt." : "Käuferprovision inkl. MwSt."} value={brokerPct} onChange={setBrokerPct} suffix="%" step={0.01} />}
          {brokerKind === "fixed" && <NumberField label="Betrag" value={brokerFixed} onChange={setBrokerFixed} suffix="€" />}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Eigenkapital</h2>
          <NumberField label="Ersparnisse gesamt" value={savings} onChange={setSavings} suffix="€" step={5000} />
          <NumberField label="Liquiditätsreserve behalten" value={reserve} onChange={setReserve} suffix="€" step={1000} hint="Wird nie als Eigenkapital eingesetzt." />
          <NumberField label="Schenkung / Familie" value={gift} onChange={setGift} suffix="€" step={5000} />
          <p className="text-sm">
            Einsetzbares Eigenkapital: <b className="num">{eur(equity)}</b>
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Haushalt</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Netto / Monat" value={netIncome} onChange={setNetIncome} suffix="€" step={100} />
            <NumberField label="Partner netto" value={partnerIncome} onChange={setPartnerIncome} suffix="€" step={100} />
            <NumberField label="Mieteinnahmen" value={rentalIncome} onChange={setRentalIncome} suffix="€" />
            <NumberField label="Sonstiges Einkommen" value={otherIncome} onChange={setOtherIncome} suffix="€" />
            <NumberField label="Kredite, Leasing, Kita, Versicherungen" value={obligations} onChange={setObligations} suffix="€" />
            <NumberField label="Zu versteuerndes Jahres-einkommen" value={taxableIncome} onChange={setTaxableIncome} suffix="€" placeholder="optional" />
            <NumberField label="Erwachsene" value={adults} onChange={setAdults} min={1} max={4} />
            <NumberField label="Kinder" value={children} onChange={setChildren} max={10} />
          </div>
          <Select label="Beschäftigung" value={employment} onChange={setEmployment} options={[["employed", "Angestellt"], ["civil_servant", "Beamt:in"], ["self_employed", "Selbstständig"]]} />
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Finanzierung</h2>
          <NumberField label="Sollzins p.a." value={ratePct} onChange={setRatePct} suffix="%" step={0.01} placeholder="Zins eingeben" />
          {rate.ok ? (
            <SourceNote p={rate.provenance} freshness={rate.freshness} />
          ) : (
            <p className="text-xs text-warn">Kein aktueller Referenzzins verfügbar ({rate.reason}). Bitte Zins aus einem Angebot eingeben.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Anfangstilgung" value={repayPct} onChange={setRepayPct} suffix="%" step={0.1} />
            <NumberField label="Zinsbindung" value={fixedYears} onChange={setFixedYears} suffix="J." min={1} max={30} />
          </div>
          <NumberField label="Sondertilgung / Jahr" value={special} onChange={setSpecial} suffix="€" step={1000} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useKfw} onChange={(e) => setUseKfw(e.target.checked)} /> Förderkredit (z. B. KfW) als zweites Darlehen
          </label>
          {useKfw && (
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Betrag" value={kfwAmount} onChange={setKfwAmount} suffix="€" />
              <NumberField label="Zins" value={kfwRate} onChange={setKfwRate} suffix="%" step={0.01} placeholder="lt. KfW" />
              <NumberField label="Tilgung" value={kfwRepay} onChange={setKfwRepay} suffix="%" step={0.1} />
            </div>
          )}
        </section>
      </aside>

      {/* RESULTS */}
      <div className="space-y-6">
        {!calc && <div className="card text-muted">Gib Kaufpreis, Zins, Tilgung und Zinsbindung ein, um die Finanzierung zu berechnen.</div>}
        {calc && price && (
          <>
            <section className="card">
              <div className="grid gap-6 sm:grid-cols-4">
                <Stat label="Monatliche Rate" value={eur(calc.payment)} sub={`${eur(calc.payment * 12)} / Jahr`} />
                <Stat label="Wahre Monatskosten" value={eur(calc.running.total)} sub="inkl. Nebenkosten (Schätzung)" />
                <Stat label="Darlehen" value={eur(calc.totalLoan)} sub={`Beleihung ${pct(ltv!.ltv)}`} />
                <Stat label="Gesamter Kapitalbedarf" value={eur(calc.costs.totalCashRequirement)} sub={`davon Nebenkosten ${eur(calc.costs.closingCosts)}`} />
              </div>
              <p className="mt-4 text-sm text-muted">
                Zinsanteil im 1. Monat {eur(calc.am.firstMonthInterest)}, Tilgungsanteil {eur(calc.am.firstMonthPrincipal)}. Restschuld nach {fixedYears} Jahren: <b className="text-ink">{eur(calc.am.balanceAtFixedEnd)}</b>
                {calc.am.payoffMonths ? <> · schuldenfrei nach ca. {(calc.am.payoffMonths / 12).toFixed(1)} Jahren bei gleichem Zins.</> : <> · Rate deckt Zinsen nicht.</>}
              </p>
            </section>

            <section className="card">
              <h2 className="mb-3 font-semibold">Kaufnebenkosten & Kapitalbedarf</h2>
              <table className="w-full text-sm">
                <tbody>
                  {calc.costs.lines.map((l, i) => (
                    <tr key={l.key} className="border-t border-line first:border-0">
                      <td className="py-2">
                        {i > 0 && "+ "}
                        {l.label}
                        {l.key === "transfer_tax" && (
                          <Why>
                            {TRANSFER_TAX_EXPLANATION} In {STATES[state]} gilt {rule.value}% seit {rule.effectiveFrom}. Quelle: {rule.sourceName}, zuletzt geprüft {rule.lastVerifiedAt}.
                          </Why>
                        )}
                        <div className="text-xs text-muted">{l.basis}</div>
                      </td>
                      <td className="num py-2 text-right text-muted">{l.pct != null && l.key !== "price" ? `${l.pct.toFixed(2)} %` : ""}</td>
                      <td className="num py-2 text-right font-medium">{eur(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink font-semibold">
                    <td className="py-2">= Gesamter Kapitalbedarf</td>
                    <td />
                    <td className="num py-2 text-right">{eur(calc.costs.totalCashRequirement)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-sm">
                Grunderwerbsteuer in dieser Berechnung: <b>{calc.costs.transferTaxPct}%</b> ({STATES[state]})
              </p>
              {equity < calc.costs.closingCosts && <Disclaimer>Dein einsetzbares Eigenkapital deckt die Nebenkosten nicht vollständig. Viele Banken erwarten, dass mindestens die Nebenkosten aus Eigenmitteln bezahlt werden.</Disclaimer>}
            </section>

            <section className="card">
              <h2 className="mb-3 font-semibold">Beleihungsauslauf (LTV)</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Darlehen / Kaufpreis" value={pct(ltv!.ltv)} />
                <Stat label="Eigenkapitalquote" value={pct(ltv!.equityPct)} />
                <Stat label="Band" value={ltv!.band} />
              </div>
              <div className="mt-4 space-y-2">
                {[0.8, 0.9, 1.0].map((b) => {
                  const loanAt = price * b;
                  const pay = loanAt * ((ratePct! + repayPct!) / 100 / 12);
                  return (
                    <div key={b} className="flex items-center gap-3 text-sm">
                      <span className="w-14 font-medium">{b * 100}%</span>
                      <div className="h-2 flex-1 rounded bg-slate-100">
                        <div className={`h-2 rounded ${ltv!.ltv <= b ? "bg-brand" : "bg-slate-300"}`} style={{ width: `${b * 100}%` }} />
                      </div>
                      <span className="num w-56 text-right text-muted">
                        Darlehen {eur(loanAt)} · Rate {eur(pay)}*
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">*Gleicher Zins unterstellt. {ltv!.note} Bei 100% Finanzierung müssen die Nebenkosten zusätzlich aus Eigenmitteln kommen — Finanzierungen über 100% sind deutlich schwerer zu bekommen.</p>
            </section>

            <section className="card">
              <h2 className="mb-3 font-semibold">Tilgungsverlauf</h2>
              <AmortizationChart schedule={calc.am.schedule} fixedYears={fixedYears!} principal={calc.loan.principal} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1">Nach</th>
                      <th className="text-right">Restschuld</th>
                      <th className="text-right">Getilgt</th>
                      <th className="text-right">Zinsen gezahlt</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {SNAP_YEARS.map((y) => {
                      const s = snapshotAt(calc.am, y, calc.loan.principal);
                      return (
                        <tr key={y} className={`border-t border-line ${y === fixedYears ? "bg-brand-soft/50 font-semibold" : ""}`}>
                          <td className="py-1.5">{y} {y === 1 ? "Jahr" : "Jahren"}</td>
                          <td className="text-right">{eur(s.balance)}</td>
                          <td className="text-right">{eur(s.principalRepaid)}</td>
                          <td className="text-right">{eur(s.interestPaid)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">Bankdarlehen ohne Förderkredit. Annahme: Zins bleibt über die gesamte Laufzeit gleich — nach der Zinsbindung siehe Szenarien.</p>
            </section>

            <section className="card">
              <h2 className="font-semibold">Anschlussfinanzierung — Szenarien</h2>
              <p className="mb-3 text-sm text-muted">
                Restschuld nach {fixedYears} Jahren: <b className="text-ink">{eur(calc.refi.balance)}</b>. Szenarien, keine Zinsprognose.
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th>Szenario-Zins</th>
                    <th className="text-right">Rate (gleiches Laufzeitende)</th>
                    <th className="text-right">Δ zur heutigen Rate</th>
                    <th className="text-right">Restlaufzeit bei gleicher Rate</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {calc.refi.scenarios.map((s) => (
                    <tr key={s.rate} className="border-t border-line">
                      <td className="py-1.5">{(s.rate * 100).toFixed(1)} %</td>
                      <td className="text-right">{eur(s.paymentSamePayoff)}</td>
                      <td className={`text-right ${s.deltaVsCurrent > 0 ? "text-risk" : "text-brand"}`}>
                        {s.deltaVsCurrent > 0 ? "+" : ""}
                        {eur(s.deltaVsCurrent)}
                      </td>
                      <td className="text-right">{s.monthsAtSamePayment == null ? "Rate deckt Zinsen nicht" : `${(s.monthsAtSamePayment / 12).toFixed(1)} J.`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm">
                Wenn die Restschuld zu 5,0% refinanziert wird, könnte deine Rate bei ca. <b>{eur(calc.refi.scenarios.find((s) => s.rate === 0.05)?.paymentSamePayoff)}</b>/Monat liegen.
              </p>
            </section>

            <section className="card">
              <h2 className="mb-3 font-semibold">Wahre monatliche Kosten</h2>
              <table className="w-full text-sm">
                <tbody>
                  {calc.running.items.map((it) => (
                    <tr key={it.key} className="border-t border-line first:border-0">
                      <td className="py-1.5">
                        {it.label} {it.kind === "estimate" && <span className="chip ml-1 text-muted">Schätzung</span>}
                        {it.note && <div className="text-xs text-muted">{it.note}</div>}
                      </td>
                      <td className="num text-right">{eur(it.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink font-semibold">
                    <td className="py-2">Gesamte Wohnkosten / Monat</td>
                    <td className="num text-right">{eur(calc.running.total)}</td>
                  </tr>
                </tbody>
              </table>
              {calc.income > 0 && <p className="mt-2 text-sm">Das entspricht {pct(calc.ratio, 0)} deines anrechenbaren Nettoeinkommens (inkl. bestehender Verpflichtungen).</p>}
            </section>

            <WhatIf
              base={calc}
              what={calc.what}
              rate={ratePct!}
              equity={equity}
              reno={renovation ?? 0}
              controls={{ wPrice, setWPrice, wRate, setWRate, wEquity, setWEquity, wReno, setWReno }}
            />
          </>
        )}

        {afford && (
          <section className="card">
            <h2 className="mb-3 font-semibold">Deine geschätzte Kaufkraft</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              <Stat label="Maximaler Kaufpreis" value={eur(afford.maximum.price)} sub="theoretisch" />
              <Stat label="Empfohlenes Ziel" value={eur(afford.recommended.price)} tone="good" />
              <Stat label="Wohnkosten / Monat" value={eur(afford.recommended.monthlyHousingCost)} sub="beim Ziel" />
              <Stat label="Verbleibende Liquidität" value={eur(afford.recommended.cashRemaining)} />
              <Stat label="Belastungsquote" value={pct(afford.recommended.debtServiceRatio, 0)} />
              <Stat label="Einschätzung" value={riskLabel[afford.risk]} tone={riskTone(afford.risk)} sub={`Konfidenz: ${afford.confidence}`} />
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              {afford.explanation.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Annahmen (änderbar in der Konfiguration): max. {DEFAULT_AFFORDABILITY_CONFIG.maxDebtServiceRatio * 100}% / komfortabel {DEFAULT_AFFORDABILITY_CONFIG.comfortableDebtServiceRatio * 100}% Belastung, Lebenshaltung {eur(DEFAULT_AFFORDABILITY_CONFIG.livingCostPerAdult)} pro Erwachsenem / {eur(DEFAULT_AFFORDABILITY_CONFIG.livingCostPerChild)} pro Kind, Mieteinnahmen zu {DEFAULT_AFFORDABILITY_CONFIG.rentalIncomeHaircut * 100}%.
            </p>
            <div className="mt-3">
              <Disclaimer>{afford.disclaimer}</Disclaimer>
            </div>
            {initial.monthlyBudget && ratePct != null && repayPct != null && (
              <MonthlyBudget budget={initial.monthlyBudget} equity={equity} rate={ratePct} repay={repayPct} state={state} broker={broker} />
            )}
          </section>
        )}

        <section className="card">
          <h2 className="mb-3 font-semibold">Staatliche Förderung — mögliche Treffer</h2>
          {programs.length === 0 && <p className="text-sm text-muted">Mit deinen Angaben haben wir kein passendes Programm in unserem Katalog gefunden.</p>}
          <div className="space-y-3">
            {programs.map(({ program: p, reasons, unknowns }) => (
              <details key={p.id} className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer font-medium">
                  Du könntest für {p.provider} {p.code} „{p.name}“ in Frage kommen.
                </summary>
                <div className="mt-2 space-y-2 text-sm">
                  <p>{p.purpose}</p>
                  {reasons.length > 0 && (
                    <div>
                      <div className="label">Warum möglicherweise</div>
                      <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                    </div>
                  )}
                  {unknowns.length > 0 && (
                    <div>
                      <div className="label">Noch unklar</div>
                      <ul className="list-disc pl-5">{unknowns.map((r) => <li key={r}>{r}</li>)}</ul>
                    </div>
                  )}
                  <div>
                    <div className="label">Wichtige Bedingungen</div>
                    <ul className="list-disc pl-5">{p.eligibilitySummary.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <p>Höchstbetrag: {p.maxAmountNote} · Kombinierbar: {p.combinable}</p>
                  <p className="text-xs text-muted">
                    Quelle: <a className="underline" href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceUrl}</a> · Stand {p.lastUpdated} · Prüfstatus {p.verificationStatus}
                  </p>
                  <Disclaimer>{p.disclaimer}</Disclaimer>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MonthlyBudget({ budget, equity, rate, repay, state, broker }: { budget: number; equity: number; rate: number; repay: number; state: StateCode; broker: BrokerArrangement }) {
  const r = priceFromMonthlyBudget(budget, equity, { annualRate: rate / 100, initialRepayment: repay / 100, state, broker: broker.kind === "fixed" ? { kind: "none" } : broker });
  return (
    <div className="mt-4 rounded-lg border border-line p-4 text-sm">
      <div className="label mb-2">Suche nach Monatsrate: {eur(budget)} / Monat</div>
      Finanzierung {eur(r.loan)} · Eigenkapital {eur(equity)} · Nebenkosten {eur(r.closingCosts)} → passender Kaufpreis bis ca. <b>{eur(r.price)}</b>
    </div>
  );
}

type Calc = { payment: number; costs: { totalCashRequirement: number }; totalLoan: number; am: { balanceAtFixedEnd: number; totalInterest: number }; running: { total: number } };

function Pills({ values, current, onPick, fmt }: { values: (number | null)[]; current: number | null; onPick: (v: number | null) => void; fmt: (v: number | null) => string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <button key={String(v)} onClick={() => onPick(v)} className={`chip ${current === v ? "border-brand bg-brand-soft" : "hover:bg-slate-50"}`}>
          {fmt(v)}
        </button>
      ))}
    </div>
  )
}

function WhatIf({
  base,
  what,
  rate,
  equity,
  reno,
  controls: c,
}: {
  base: Calc;
  what: Calc;
  rate: number;
  equity: number;
  reno: number;
  controls: {
    wPrice: number;
    setWPrice: (v: number) => void;
    wRate: number | null;
    setWRate: (v: number | null) => void;
    wEquity: number | null;
    setWEquity: (v: number | null) => void;
    wReno: number | null;
    setWReno: (v: number | null) => void;
  };
}) {
  const row = (label: string, a: number, b: number) => (
    <tr className="border-t border-line">
      <td className="py-1.5">{label}</td>
      <td className="num text-right">{eur(a)}</td>
      <td className="num text-right font-medium">{eur(b)}</td>
      <td className={`num text-right ${b - a > 0 ? "text-risk" : b - a < 0 ? "text-brand" : "text-muted"}`}>{b - a === 0 ? "–" : `${b - a > 0 ? "+" : ""}${eur(b - a)}`}</td>
    </tr>
  );
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">Was wäre wenn?</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="label mb-1">Kaufpreis</div>
          <Pills values={[-10, -5, 0, 5, 10]} current={c.wPrice} onPick={(v) => c.setWPrice(v ?? 0)} fmt={(v) => `${v! > 0 ? "+" : ""}${v}%`} />
        </div>
        <div>
          <div className="label mb-1">Zins (aktuell {rate}%)</div>
          <Pills values={[null, 3, 4, 5, 6]} current={c.wRate} onPick={c.setWRate} fmt={(v) => (v == null ? "wie oben" : `${v}%`)} />
        </div>
        <div>
          <div className="label mb-1">Eigenkapital (aktuell {eur(equity)})</div>
          <Pills values={[null, 25_000, 50_000, 100_000, 150_000]} current={c.wEquity} onPick={c.setWEquity} fmt={(v) => (v == null ? "wie oben" : eur(v))} />
        </div>
        <div>
          <div className="label mb-1">Renovierung (aktuell {eur(reno)})</div>
          <Pills values={[null, 0, 25_000, 50_000, 100_000]} current={c.wReno} onPick={c.setWReno} fmt={(v) => (v == null ? "wie oben" : eur(v))} />
        </div>
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th />
            <th className="text-right">Heute</th>
            <th className="text-right">Szenario</th>
            <th className="text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {row("Monatliche Rate", base.payment, what.payment)}
          {row("Wahre Monatskosten", base.running.total, what.running.total)}
          {row("Kapitalbedarf", base.costs.totalCashRequirement, what.costs.totalCashRequirement)}
          {row("Darlehen", base.totalLoan, what.totalLoan)}
          {row("Restschuld Ende Zinsbindung", base.am.balanceAtFixedEnd, what.am.balanceAtFixedEnd)}
          {row("Zinsen gesamt (Bankdarlehen)", base.am.totalInterest, what.am.totalInterest)}
        </tbody>
      </table>
    </section>
  );
}
