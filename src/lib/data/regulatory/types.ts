/**
 * Versioned regulatory records. Every rule carries jurisdiction, validity window and
 * source. Rules must be independently re-verified against the cited official source
 * before production release — `verificationStatus` records where each one stands.
 */
export type VerificationStatus =
  | "verified_official" // checked against the official source on last_verified_at
  | "secondary_source" // checked against reputable secondary sources only
  | "unverified"; // must not ship to production

export interface RegulatoryRule<T> {
  id: string;
  version: number;
  jurisdiction: string; // e.g. "DE", "DE-BY", "DE-BE-Berlin"
  effectiveFrom: string; // ISO date
  effectiveTo?: string; // ISO date, exclusive
  value: T;
  sourceName: string;
  sourceUrl: string;
  lastVerifiedAt: string; // ISO date
  verificationStatus: VerificationStatus;
  notes?: string;
}

export function ruleInForce<T>(rules: RegulatoryRule<T>[], jurisdiction: string, on: Date = new Date()) {
  const day = on.toISOString().slice(0, 10);
  return rules.find(
    (r) => r.jurisdiction === jurisdiction && r.effectiveFrom <= day && (!r.effectiveTo || day < r.effectiveTo),
  );
}
