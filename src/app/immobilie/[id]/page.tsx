import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/listings/store";
import { listingFreshness, listingQuality } from "@/lib/listings/quality";
import { marketPriceProvider, mortgageRateProvider, neighborhoodProvider, rentalRegulationProvider } from "@/lib/data/providers/registry";
import { propertyBrief, questionsToAsk } from "@/lib/ai/brief";
import { propertyScore } from "@/lib/scoring/propertyScore";
import { renterMonthlyCost } from "@/lib/finance/monthlyCost";
import { RENT_CAP_RULE, RENTAL_BROKER_RULE } from "@/lib/data/regulatory/acquisitionRules";
import { AffordPanel } from "./AffordPanel";
import { Assistant } from "./Assistant";

const eur = (x?: number) => (x == null ? "–" : x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
const CAT_LABEL = { fact: "Bekannte Fakten", estimate: "Schätzungen", external: "Externe Daten", assumption: "Annahmen", unknown: "Unbekannt" } as const;

export default async function PropertyPage({ params }: PageProps<"/immobilie/[id]">) {
  const { id } = await params;
  const view = await getProperty(decodeURIComponent(id));
  if (!view) notFound();
  const l = view.listing;
  const rate = await mortgageRateProvider.getCurrentRate({ fixedYears: 10 });
  const quality = listingQuality(l);
  const fresh = listingFreshness(l);
  const point = l.address.lat != null && l.address.lng != null ? { lat: l.address.lat, lng: l.address.lng } : null;
  const market = point && l.livingArea ? await marketPriceProvider.comparables({ location: point, livingArea: l.livingArea, type: l.type, transaction: l.transaction }) : null;
  const hood = point ? await neighborhoodProvider.metrics(point) : null;
  const rentCap = l.transaction === "rent" && l.address.postcode ? await rentalRegulationProvider.rentCapStatus(l.address.postcode) : null;
  const main = l.transaction === "buy" ? l.price : l.warmRent ?? l.coldRent;
  const ppsqm = main && l.livingArea ? main / l.livingArea : undefined;
  const marketDiff = market?.ok && ppsqm ? ((ppsqm - market.value.medianPricePerSqm) / market.value.medianPricePerSqm) * 100 : undefined;
  const score = propertyScore(l, { name: "Standard", transaction: l.transaction, purpose: "owner_occupied", mustHave: [], niceToHave: [] }, { marketDiffPct: marketDiff });
  const brief = propertyBrief(l);
  const questions = questionsToAsk(l);
  const photos = l.images.filter((i) => !i.isFloorplan);
  const floorplans = l.images.filter((i) => i.isFloorplan);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link href="/suche" className="text-sm text-muted hover:underline">← Zur Suche</Link>
      <div className="mt-3 grid gap-2 sm:grid-cols-4 sm:grid-rows-2">
        {photos.slice(0, 5).map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.url} src={p.url} alt={p.caption ?? ""} className={`h-full w-full rounded-xl object-cover ${i === 0 ? "sm:col-span-2 sm:row-span-2 sm:h-96" : "hidden h-44 sm:block"}`} />
        ))}
        {!photos.length && <div className="flex h-60 items-center justify-center rounded-xl bg-slate-100 text-muted sm:col-span-4">Keine Fotos vorhanden</div>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="chip">{fresh.label}</span>
              <span className={`chip ${quality.badge.startsWith("Important") ? "border-warn text-warn" : ""}`}>{quality.badge.startsWith("Important") ? "Wichtige Infos fehlen" : `Vollständigkeit ${quality.score}%`}</span>
              {view.providers.length > 1 && <span className="chip">Von {view.providers.length} Anbietern gelistet</span>}
            </div>
            <h1 className="mt-2 text-2xl font-bold">{l.title}</h1>
            <p className="text-muted">{[l.address.street && `${l.address.street} ${l.address.houseNumber ?? ""}`, l.address.postcode, l.address.city].filter(Boolean).join(", ")}</p>
            <div className="num mt-3 flex flex-wrap gap-6">
              <div><div className="label">{l.transaction === "buy" ? "Kaufpreis" : "Warmmiete"}</div><div className="text-2xl font-semibold">{eur(main)}</div></div>
              <div><div className="label">€/m²</div><div className="text-2xl font-semibold">{eur(ppsqm)}</div></div>
              <div><div className="label">Zimmer</div><div className="text-2xl font-semibold">{l.rooms ?? "–"}</div></div>
              <div><div className="label">Wohnfläche</div><div className="text-2xl font-semibold">{l.livingArea ? `${l.livingArea} m²` : "–"}</div></div>
              <div><div className="label">Score</div><div className="text-2xl font-semibold text-brand">{score.overall ?? "–"}/100</div></div>
            </div>
          </section>

          <section className="card">
            <h2 className="font-semibold">Überblick</h2>
            {l.description ? <p className="mt-2 whitespace-pre-line text-sm">{l.description}</p> : <p className="mt-2 text-sm text-muted">Keine Beschreibung.</p>}
            <div className="mt-3 flex flex-wrap gap-1">{l.features.map((f) => <span key={f} className="chip">{f}</span>)}</div>
          </section>

          <section className="card">
            <details>
              <summary className="cursor-pointer font-semibold">Warum {score.overall ?? "–"}? — Bewertung aufschlüsseln</summary>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {score.components.map((c) => (
                    <tr key={c.key} className="border-t border-line align-top">
                      <td className="py-2 font-medium">{c.label}</td>
                      <td className="num py-2 text-right">{c.score ?? "–"}{c.score != null && "/100"}</td>
                      <td className="num py-2 text-right text-muted">Gewicht {c.weight}</td>
                      <td className="py-2 pl-4 text-muted">{c.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {score.excluded.length > 0 && <p className="mt-2 text-xs text-muted">Nicht bewertet (fehlende Daten): {score.excluded.join(", ")}. Diese Komponenten fließen nicht in den Gesamtwert ein.</p>}
            </details>
          </section>

          {l.transaction === "rent" && (
            <section className="card">
              <h2 className="font-semibold">Monatliche Miete</h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {renterMonthlyCost(l.coldRent ?? 0, l.utilities, l.heatingCosts, l.warmRent).items.map((i) => (
                    <tr key={i.key} className="border-t border-line first:border-0"><td className="py-1.5">{i.label}</td><td className="num text-right">{eur(i.amount)}</td></tr>
                  ))}
                  <tr className="border-t-2 border-ink font-semibold"><td className="py-1.5">Warmmiete gesamt</td><td className="num text-right">{eur(l.warmRent ?? undefined)}</td></tr>
                </tbody>
              </table>
              {l.deposit && <p className="mt-2 text-sm">Kaution: {eur(l.deposit)}</p>}
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="label mb-1">Mietrecht — Hinweise</div>
                <p>{RENT_CAP_RULE.value.summary}</p>
                <p className="mt-1">{rentCap?.ok ? (rentCap.value.ordinanceInForce ? "Für diesen Ort ist laut Datenquelle eine Mietpreisbremsen-Verordnung in Kraft." : "Für diesen Ort ist laut Datenquelle keine Verordnung in Kraft.") : "Für diesen Ort liegen uns noch keine geprüften Mietspiegel- oder Verordnungsdaten vor."}</p>
                <p className="mt-1">{RENTAL_BROKER_RULE.value.summary}</p>
                <p className="mt-1 text-xs text-muted">Ob die Mietpreisbremse greift, hängt u. a. von Ort, Baujahr/Erstbezug, Modernisierung und Vormiete ab — wir treffen keine rechtliche Bewertung. Quelle: <a className="underline" href={RENT_CAP_RULE.sourceUrl}>{RENT_CAP_RULE.sourceName}</a>.</p>
              </div>
            </section>
          )}

          <section className="card">
            <h2 className="font-semibold">Energie</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><dt className="label">Klasse</dt><dd>{l.energy?.class ?? "unbekannt"}</dd></div>
              <div><dt className="label">Kennwert</dt><dd>{l.energy?.kwhPerSqmYear ? `${l.energy.kwhPerSqmYear} kWh/m²a` : "unbekannt"}</dd></div>
              <div><dt className="label">Ausweis</dt><dd>{l.energy?.certificateType === "demand" ? "Bedarfsausweis" : l.energy?.certificateType === "consumption" ? "Verbrauchsausweis" : "unbekannt"}</dd></div>
              <div><dt className="label">Heizung</dt><dd>{l.energy?.heating ?? "unbekannt"}{l.energy?.heatingYear ? ` (${l.energy.heatingYear})` : ""}</dd></div>
            </dl>
            {l.energy?.kwhPerSqmYear && l.livingArea && (
              <div className="mt-3 text-sm">
                <div className="label mb-1">Energiekosten-Szenarien (Endenergie × Fläche × Preis)</div>
                <div className="num flex flex-wrap gap-4">
                  {[0.1, 0.15, 0.25, 0.35].map((p) => (
                    <span key={p}>{(p * 100).toFixed(0)} ct/kWh: <b>{eur((l.energy!.kwhPerSqmYear! * l.livingArea! * p) / 12)}</b>/Monat</span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">Szenariopreise, keine aktuellen Tarife. Tatsächliche Kosten hängen vom Verbrauch und Tarif ab; Verbrauchsausweise spiegeln das Verhalten der Vorbewohner.</p>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="font-semibold">Marktvergleich</h2>
            {market?.ok ? (
              <p className="mt-2 text-sm">
                Angebot {eur(ppsqm)}/m² · Vergleichswert (Median, {market.value.sampleSize} Objekte) {eur(market.value.medianPricePerSqm)}/m² · Differenz {marketDiff! > 0 ? "+" : ""}{marketDiff!.toFixed(1)}% — indikativer Vergleich.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">Für diese Lage liegen noch keine lizenzierten Vergleichsdaten vor. Wir zeigen keinen Vergleich ohne belastbare Quelle.</p>
            )}
          </section>

          <section className="card">
            <h2 className="font-semibold">Umgebung</h2>
            <p className="mt-2 text-sm text-muted">{hood?.ok ? "" : "Umgebungsdaten (ÖPNV, Schulen, Ärzte, Grün, Lärm) werden angezeigt, sobald ein Datenanbieter angebunden ist. Wir erfinden keine Kennzahlen."}</p>
          </section>

          {l.priceHistory.length > 1 && (
            <section className="card">
              <h2 className="font-semibold">Preisverlauf</h2>
              <ul className="num mt-2 text-sm">{l.priceHistory.map((p) => <li key={p.at}>{p.at.slice(0, 10)}: {eur(p.price)}</li>)}</ul>
            </section>
          )}

          <section className="card">
            <h2 className="font-semibold">Fragen an Anbieter:in</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
          </section>

          <section className="card">
            <h2 className="font-semibold">Was wir wissen — und was nicht</h2>
            {(["fact", "unknown"] as const).map((cat) => (
              <div key={cat} className="mt-2">
                <div className="label">{CAT_LABEL[cat]}</div>
                <ul className="list-disc pl-5 text-sm">{brief.filter((b) => b.category === cat).map((b) => <li key={b.text}>{b.text}</li>)}</ul>
              </div>
            ))}
          </section>

          {floorplans.length > 0 && (
            <section className="card">
              <h2 className="font-semibold">Grundriss</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {floorplans.map((f) => <img key={f.url} src={f.url} alt="Grundriss" className="mt-2 max-h-[500px]" />)}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          {l.transaction === "buy" && l.price && (
            <AffordPanel price={l.price} state={l.address.state} hausgeld={l.hausgeld} livingArea={l.livingArea ?? 0} propertyType={l.type === "house" ? "house" : "apartment"} commission={l.commission} rate={rate.ok ? { value: rate.value.annualRate, source: rate.provenance.sourceName, observedAt: rate.provenance.observedAt } : null} />
          )}
          <section className="card text-sm">
            <h2 className="font-semibold">Anbieter</h2>
            {view.providers.map((p) => (
              <div key={p.id} className="mt-2 border-t border-line pt-2 first:border-0">
                <div className="font-medium">{p.contact?.agency ?? p.contact?.name ?? p.source.name}{p.contact?.privateSeller && " (privat)"}</div>
                <div className="text-xs text-muted">Quelle: {p.source.name} · zuletzt aktualisiert {p.lastUpdatedAt.slice(0, 10)}</div>
                {p.contact?.email && <a className="btn mt-2 w-full" href={`mailto:${p.contact.email}?subject=${encodeURIComponent(`Anfrage: ${l.title}`)}`}>Kontakt aufnehmen</a>}
              </div>
            ))}
          </section>
          <Assistant propertyId={view.property.id} />
        </aside>
      </div>
    </div>
  );
}
