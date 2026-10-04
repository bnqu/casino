/**
 * Provenance is mandatory for every piece of dynamic market, financial, legal or
 * neighbourhood data. A value without provenance must not be shown to a user.
 */

export type Freshness = "fresh" | "aging" | "stale" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type SourceKind =
  | "official_statistic" // Bundesbank, Destatis, state statistics offices
  | "official_law" // Gesetze-im-Internet, state law gazettes
  | "official_program" // KfW, state promotional banks
  | "commercial_benchmark" // published lender / broker market data
  | "partner_feed" // licensed listing or lender feed
  | "user_input" // the user typed it
  | "assumption" // a documented default the user can change
  | "calculation"; // derived by our engines from the above

export interface Provenance {
  sourceName: string;
  sourceUrl?: string;
  kind: SourceKind;
  /** When the underlying value was published / observed (ISO 8601). */
  observedAt?: string;
  /** When we last fetched or verified it (ISO 8601). */
  retrievedAt?: string;
  methodology?: string;
  confidence?: Confidence;
  /** e.g. "Indicative only", "Not a credit decision". */
  disclaimer?: string;
}

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  freshness: Freshness;
}

/**
 * Result type for providers: either a sourced value or an explicit "unavailable"
 * with a reason. Providers never fall back to invented numbers.
 */
export type ProviderResult<T> =
  | ({ ok: true } & Sourced<T>)
  | { ok: false; reason: string; provider: string };

export function freshnessOf(
  observedAt: string | undefined,
  maxAgeDays: { fresh: number; aging: number },
  now: Date = new Date(),
): Freshness {
  if (!observedAt) return "unknown";
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return "unknown";
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (ageDays <= maxAgeDays.fresh) return "fresh";
  if (ageDays <= maxAgeDays.aging) return "aging";
  return "stale";
}

export function assumption(name: string, methodology: string): Provenance {
  return { sourceName: name, kind: "assumption", methodology, confidence: "low", disclaimer: "Editable assumption" };
}
