import { connection } from "next/server";
import { TRANSFER_TAX_RULES, STATES, transferTaxRule, type StateCode } from "@/lib/data/regulatory/transferTax";
import { BROKER_SPLIT_RULE, NOTARY_LAND_REGISTER, RENT_CAP_RULE, RENTAL_BROKER_RULE } from "@/lib/data/regulatory/acquisitionRules";
import { PROGRAM_CATALOGUE } from "@/lib/data/providers/governmentPrograms";
import { governmentProgramProvider, marketPriceProvider, mortgageRateProvider, neighborhoodProvider, rentalRegulationProvider, travelTimeProvider } from "@/lib/data/providers/registry";

export const metadata = { title: "Datenquellen & Methodik — ImmoKnauer" };

const STATUS = { verified_official: "amtlich geprüft", secondary_source: "Sekundärquelle — vor Produktivstart amtlich prüfen", unverified: "ungeprüft" } as const;

export default async function SourcesPage() {
  await connection();
  const probe = { lat: 52.52, lng: 13.405 };
  const checks = await Promise.all([
    mortgageRateProvider.getCurrentRate({ fixedYears: 10 }).then((r) => ["Bauzinsen (MortgageRateProvider)", r] as const),
    governmentProgramProvider.listPrograms().then((r) => ["Förderprogramme (GovernmentProgramProvider)", r] as const),
    travelTimeProvider.travelTime(probe, { lat: 52.5, lng: 13.3 }, "transit").then((r) => ["Pendelzeit (TravelTimeProvider)", r] as const),
    marketPriceProvider.comparables({ location: probe, livingArea: 80, type: "apartment", transaction: "buy" }).then((r) => ["Marktvergleich (MarketPriceProvider)", r] as const),
    neighborhoodProvider.metrics(probe).then((r) => ["Umgebung (NeighborhoodDataProvider)", r] as const),
    rentalRegulationProvider.rentCapStatus("10115").then((r) => ["Mietrecht (RentalRegulationProvider)", r] as const),
  ]);
  const rules = [NOTARY_LAND_REGISTER, BROKER_SPLIT_RULE, RENTAL_BROKER_RULE, RENT_CAP_RULE];
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Datenquellen & Methodik</h1>
      <p className="text-muted">Jeder dynamische Wert braucht Quelle, Stand, Aktualität und Methodik. Ist ein Provider nicht angebunden, zeigen wir keinen Wert.</p>

      <section className="card">
        <h2 className="mb-2 font-semibold">Provider-Status</h2>
        <table className="w-full text-sm">
          <tbody>
            {checks.map(([name, r]) => (
              <tr key={name} className="border-t border-line align-top first:border-0">
                <td className="py-2 font-medium">{name}</td>
                <td className={`py-2 ${r.ok ? "text-brand" : "text-warn"}`}>{r.ok ? "verfügbar" : "nicht verfügbar"}</td>
                <td className="py-2 text-muted">{r.ok ? `${r.provenance.sourceName}${r.provenance.methodology ? ` — ${r.provenance.methodology}` : ""}` : r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Grunderwerbsteuer (aktuell gültig)</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr><th>Land</th><th className="text-right">Satz</th><th>gültig ab</th><th>Prüfstatus</th></tr></thead>
          <tbody>
            {(Object.keys(STATES) as StateCode[]).map((s) => {
              const r = transferTaxRule(s);
              return (
                <tr key={s} className="border-t border-line">
                  <td className="py-1.5">{STATES[s]}</td>
                  <td className="num text-right">{r.value.toFixed(1)} %</td>
                  <td className="pl-4">{r.effectiveFrom}</td>
                  <td className="text-xs text-muted">{STATUS[r.verificationStatus]} · {r.lastVerifiedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">{TRANSFER_TAX_RULES.length} versionierte Einträge inkl. historischer Sätze. Rechtsgrundlage: <a className="underline" href="https://www.gesetze-im-internet.de/grestg_1983/__11.html">§ 11 GrEStG</a>.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Weitere Regeln</h2>
        {rules.map((r) => (
          <div key={r.id} className="border-t border-line pt-2 text-sm first:border-0">
            <div className="font-medium">{r.sourceName} <span className="chip ml-1 text-muted">v{r.version}</span></div>
            <div className="text-xs text-muted">{r.jurisdiction} · gültig ab {r.effectiveFrom} · {STATUS[r.verificationStatus]} · geprüft {r.lastVerifiedAt} · <a className="underline" href={r.sourceUrl}>Quelle</a></div>
            {r.notes && <p className="text-xs">{r.notes}</p>}
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Förderprogramm-Katalog</h2>
        <ul className="text-sm">
          {PROGRAM_CATALOGUE.map((p) => <li key={p.id}>{p.provider} {p.code} — {p.name} · {STATUS[p.verificationStatus]} · <a className="underline" href={p.sourceUrl}>Merkblatt</a></li>)}
        </ul>
        <p className="mt-2 text-xs text-muted">Bewusst ohne Zinssätze und Beträge: diese ändern sich häufig und werden nur aus einer gepflegten Quelle angezeigt.</p>
      </section>
    </div>
  );
}
