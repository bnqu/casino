import Link from "next/link";
import { listProperties } from "@/lib/listings/store";
import { monthlyBudgetCeiling, parseQuery, search } from "@/lib/listings/search";
import { listingFreshness, listingQuality } from "@/lib/listings/quality";
import { mortgageRateProvider } from "@/lib/data/providers/registry";
import { SearchFilters } from "./SearchFilters";
import { ResultsMap } from "./ResultsMap";

export const metadata = { title: "Immobilien suchen — ImmoKnauer" };

const eur = (x?: number) => (x == null ? "–" : x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = parseQuery(sp);
  const providerRate = await mortgageRateProvider.getCurrentRate({ fixedYears: 10 });
  const userRate = sp.rate && Number.isFinite(Number(sp.rate)) ? Number(sp.rate) / 100 : undefined;
  const annualRate = userRate ?? (providerRate.ok ? providerRate.value.annualRate : undefined);
  const all = await listProperties();
  const hits = search(all, q, annualRate);
  const ceiling = monthlyBudgetCeiling(q, annualRate, "DE-NW");
  const view = sp.view === "map" ? "map" : "list";

  const markers = hits
    .filter((h) => h.listing.address.lat != null && h.listing.address.lng != null)
    .map((h) => ({ id: h.property.id, lat: h.listing.address.lat!, lng: h.listing.address.lng!, label: q.tx === "buy" ? `${Math.round((h.listing.price ?? 0) / 1000)}k` : `${Math.round(h.listing.warmRent ?? h.listing.coldRent ?? 0)} €`, title: h.listing.title }));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <SearchFilters q={q} rateKnown={annualRate != null} rateFromUser={userRate != null} />
      {q.monthly && q.tx === "buy" && (
        <div className="mt-3 rounded-lg border border-line bg-white p-3 text-sm">
          {annualRate == null ? (
            <span className="text-warn">Für die Suche nach Monatsrate brauchen wir einen Zinssatz — kein Referenzzins verfügbar. Bitte Zins im Filter angeben.</span>
          ) : (
            <>
              Monatsbudget <b>{eur(q.monthly)}</b> bei {(annualRate * 100).toFixed(2)}% Zins, 2% Tilgung, Eigenkapital {eur(q.equity ?? 0)} → Kaufpreis bis ca. <b>{eur(ceiling)}</b> (je Bundesland leicht abweichend durch Grunderwerbsteuer).{" "}
              <Link className="underline" href={`/finanzierung?monthly=${q.monthly}&savings=${q.equity ?? ""}`}>Details</Link>
            </>
          )}
        </div>
      )}
      <div className="mt-2 flex gap-2 lg:hidden">
        <Link className={view === "list" ? "btn" : "btn-ghost"} href={`?${new URLSearchParams({ ...clean(sp), view: "list" })}`}>Liste</Link>
        <Link className={view === "map" ? "btn" : "btn-ghost"} href={`?${new URLSearchParams({ ...clean(sp), view: "map" })}`}>Karte</Link>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(420px,1fr)_1.2fr]">
        <div className={`space-y-3 ${view === "map" ? "hidden lg:block" : ""}`}>
          <p className="text-sm text-muted">{hits.length} Immobilien</p>
          {all.length === 0 && (
            <div className="card">
              <h2 className="font-semibold">Noch keine Angebote</h2>
              <p className="mt-1 text-sm text-muted">
                ImmoKnauer zeigt nur Angebote aus lizenzierten Feeds, Partner-Uploads oder manueller Erfassung — keine Platzhalter. Importiere einen Feed unter{" "}
                <Link className="underline" href="/import">Import</Link>.
              </p>
            </div>
          )}
          {hits.map(({ property, listing: l, providers }) => {
            const fresh = listingFreshness(l);
            const quality = listingQuality(l);
            const main = q.tx === "buy" ? l.price : l.warmRent ?? l.coldRent;
            return (
              <Link key={property.id} href={`/immobilie/${encodeURIComponent(property.id)}`} className="card flex gap-4 transition hover:shadow-md">
                <div className="h-28 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {l.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.images[0].url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1 text-xs">
                    <span className={`chip ${fresh.tone === "new" ? "border-brand text-brand" : fresh.tone === "maybe_stale" ? "border-warn text-warn" : "text-muted"}`}>{fresh.label}</span>
                    <span className={`chip ${quality.badge.startsWith("Important") ? "text-warn" : "text-muted"}`}>{quality.badge.startsWith("Important") ? "Wichtige Infos fehlen" : `Vollständigkeit ${quality.score}%`}</span>
                    {providers.length > 1 && <span className="chip text-muted">Von {providers.length} Anbietern gelistet</span>}
                  </div>
                  <h3 className="mt-1 truncate font-semibold">{l.title}</h3>
                  <p className="text-sm text-muted">{[l.address.postcode, l.address.city].filter(Boolean).join(" ")}</p>
                  <p className="num mt-1 text-sm">
                    <b className="text-base">{eur(main)}</b>
                    {q.tx === "rent" && " warm"}
                    {l.livingArea && main ? ` · ${eur(main / l.livingArea)}/m²` : ""} · {l.rooms ?? "?"} Zi. · {l.livingArea ?? "?"} m²
                    {l.energy?.class && ` · Klasse ${l.energy.class}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
        <div className={`${view === "list" ? "hidden lg:block" : ""} lg:sticky lg:top-16 lg:h-[calc(100vh-6rem)]`}>
          <ResultsMap markers={markers} />
        </div>
      </div>
    </div>
  );
}

function clean(sp: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(sp).filter(([, v]) => v != null)) as Record<string, string>;
}
