# ImmoKnauer

German property search built around one idea: **find the right property _and_ understand whether you can afford it, whether it is a good deal, and what living there is really like.** Supports buying (Kaufen) and renting (Mieten), residential first.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # finance, regulatory, ingestion, dedup, intent tests
npm run typecheck && npm run lint
```

## Principles enforced in code

- **No fake data.** There are no demo listings and no hardcoded market rates. Listings come only from licensed feeds, partner/agent uploads or manual entry (`/import`). The mortgage rate is fetched from a provider or typed in by the user; if no provider is configured the UI says so.
- **Provenance everywhere.** Providers return `ProviderResult<T>` (`src/lib/data/provenance.ts`): either a value with source, timestamp, freshness, methodology and confidence, or an explicit "unavailable" with a reason.
- **Versioned regulation.** Legal and tax rules live in `src/lib/data/regulatory/` with jurisdiction, validity window, source URL, last-verified date and verification status. **Every rule is currently `secondary_source` or `unverified` and must be checked against the official source before a production release.**
- **Estimates, not decisions.** Affordability output is labelled "Indicative estimate. Not a credit decision." Scenarios are labelled as scenarios.

## Layout

| Path | What |
| --- | --- |
| `src/lib/finance/` | Amortisation engine (monthly simulation, special repayments, payment changes, refinance scenarios), purchase costs, affordability (max vs. recommended budget, reserve-aware), monthly-budget → price, true monthly cost, LTV, rent vs. buy, investor metrics |
| `src/lib/data/regulatory/` | Grunderwerbsteuer per Bundesland (with history), notary/land-register approximation, broker rules (§656a ff. BGB, Bestellerprinzip), Mietpreisbremse |
| `src/lib/data/providers/` | Provider interfaces (`types.ts`) and the composition root (`registry.ts`): Bundesbank mortgage rates, KfW program catalogue + matcher, travel time, market prices, neighbourhood, rental regulation |
| `src/lib/listings/` | Ingestion pipeline (CSV → normalise → validate → dedupe → canonical property), quality score, evidence-based freshness, deduplication, search |
| `src/lib/scoring/` | Transparent, weighted, explainable property/match score; missing data is excluded and listed |
| `src/lib/intent/` | Deterministic free-text parser ("€80k savings, €5,500 net, 3 bedrooms in Berlin…") |
| `src/lib/ai/` | Grounding brief (facts / unknowns) and questions-to-ask for the Claude assistant (`/api/assistant`) |
| `db/schema.sql` | Target PostgreSQL + PostGIS schema covering the full data model |

Pages: `/` (natural-language intake), `/finanzierung`, `/mieten-oder-kaufen`, `/investor`, `/suche` (list + map, monthly-payment search), `/immobilie/[id]`, `/import`, `/datenquellen` (provider status + rule register).

## Not yet built (next steps)

Accounts, saved searches/alerts and watchlist (schema exists), real routing/neighbourhood/market providers, document upload and extraction, polygon drawing and overlays on the map, Postgres repository implementation, verified legal datasets.
