import { freshnessOf, type ProviderResult } from "../provenance";
import type { IndicativeRate, MortgageRateProvider, RateQuery } from "./types";

/**
 * Bundesbank MFI interest-rate statistics: average effective rates on new housing
 * loans to households, by initial rate fixation. This is an official market average,
 * not an offer — so `personalised: false` and confidence "medium".
 *
 * Series keys are configuration (BUNDESBANK_MORTGAGE_SERIES), a JSON map from a
 * fixation bucket to "<flow>/<key>", e.g.
 *   {"5-10":"BBIM1/<key>","10+":"BBIM1/<key>"}
 * Look up the current keys in the Bundesbank time-series database
 * (https://www.bundesbank.de/en/statistics/time-series-databases) — they are not
 * hardcoded here because a wrong key would silently show the wrong statistic.
 */
type Bucket = "1-5" | "5-10" | "10+";
const bucketFor = (years: number): Bucket => (years <= 5 ? "1-5" : years <= 10 ? "5-10" : "10+");

export class BundesbankMortgageRateProvider implements MortgageRateProvider {
  id = "bundesbank";
  constructor(
    private series: Partial<Record<Bucket, string>>,
    private fetchImpl: typeof fetch = fetch,
    private baseUrl = "https://api.statistiken.bundesbank.de/rest/data",
  ) {}

  async getCurrentRate(q: RateQuery): Promise<ProviderResult<IndicativeRate>> {
    const bucket = bucketFor(q.fixedYears);
    const ref = this.series[bucket];
    if (!ref) return { ok: false, provider: this.id, reason: `No Bundesbank series configured for fixation ${bucket} years` };
    const url = `${this.baseUrl}/${ref}?format=csv&lastNObservations=1`;
    try {
      const res = await this.fetchImpl(url, { headers: { Accept: "text/csv" }, next: { revalidate: 86_400 } } as RequestInit);
      if (!res.ok) return { ok: false, provider: this.id, reason: `Bundesbank API responded ${res.status}` };
      const obs = parseLastObservation(await res.text());
      if (!obs) return { ok: false, provider: this.id, reason: "Could not parse Bundesbank response" };
      return {
        ok: true,
        value: {
          annualRate: obs.value / 100,
          rateType: "effective",
          fixedYears: q.fixedYears,
          benchmark: `Bundesbank average effective rate, new housing loans to households, initial fixation ${bucket} years`,
          personalised: false,
        },
        provenance: {
          sourceName: "Deutsche Bundesbank — MFI interest rate statistics",
          sourceUrl: url,
          kind: "official_statistic",
          observedAt: obs.period,
          retrievedAt: new Date().toISOString(),
          methodology: "Volume-weighted average of rates agreed on new business in the reference month across German banks.",
          confidence: "medium",
          disclaimer: "Indicative market average — your rate depends on loan-to-value, amount, term and your credit profile.",
        },
        // Monthly statistic published with ~5 weeks lag.
        freshness: freshnessOf(obs.period.length === 7 ? `${obs.period}-01` : obs.period, { fresh: 70, aging: 120 }),
      };
    } catch (e) {
      return { ok: false, provider: this.id, reason: `Bundesbank API unreachable: ${(e as Error).message}` };
    }
  }
}

/** SDMX-CSV: header row then data rows; TIME_PERIOD and OBS_VALUE columns. */
export function parseLastObservation(csv: string): { period: string; value: number } | null {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim());
  const ti = header.indexOf("TIME_PERIOD");
  const vi = header.indexOf("OBS_VALUE");
  if (ti < 0 || vi < 0) return null;
  const row = lines[lines.length - 1].split(sep).map((c) => c.replace(/"/g, "").trim());
  const value = Number(row[vi].replace(",", "."));
  return Number.isFinite(value) ? { period: row[ti], value } : null;
}

/** Placeholder for a future lender/broker partner API delivering personalised quotes. */
export class PartnerQuoteProvider implements MortgageRateProvider {
  id = "partner";
  async getCurrentRate(): Promise<ProviderResult<IndicativeRate>> {
    return { ok: false, provider: this.id, reason: "No financing partner integration configured" };
  }
}

/** Tries providers in order; returns the first success, else all reasons. */
export class ChainedMortgageRateProvider implements MortgageRateProvider {
  id = "chain";
  constructor(private providers: MortgageRateProvider[]) {}
  async getCurrentRate(q: RateQuery): Promise<ProviderResult<IndicativeRate>> {
    const reasons: string[] = [];
    for (const p of this.providers) {
      const r = await p.getCurrentRate(q);
      if (r.ok) return r;
      reasons.push(`${p.id}: ${r.reason}`);
    }
    return { ok: false, provider: this.id, reason: reasons.join("; ") || "No rate providers configured" };
  }
}
