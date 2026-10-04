import type { RegulatoryRule } from "./types";

/**
 * Notary and land-register costs are governed by the GNotKG fee schedule, which is
 * value-based and degressive. These percentages are the widely used planning
 * approximations — explicitly an assumption, not a fee calculation.
 */
export const NOTARY_LAND_REGISTER: RegulatoryRule<{ notaryPct: number; landRegisterPct: number }> = {
  id: "de-notary-approx",
  version: 1,
  jurisdiction: "DE",
  effectiveFrom: "2013-08-01",
  value: { notaryPct: 1.5, landRegisterPct: 0.5 },
  sourceName: "Gerichts- und Notarkostengesetz (GNotKG) — planning approximation",
  sourceUrl: "https://www.gesetze-im-internet.de/gnotkg/",
  lastVerifiedAt: "2026-10-04",
  verificationStatus: "secondary_source",
  notes: "Approximation. Actual fees follow the GNotKG schedule and depend on the purchase price, financing (Grundschuld) and services used.",
};

/**
 * Broker commission rules for consumer purchases of apartments and single-family
 * homes (§§ 656a–656d BGB, in force since 23 Dec 2020): if the seller engaged the
 * broker, the buyer can be required to pay at most the same share as the seller.
 */
export const BROKER_SPLIT_RULE: RegulatoryRule<{ appliesTo: string[]; summary: string }> = {
  id: "de-bgb-656c",
  version: 1,
  jurisdiction: "DE",
  effectiveFrom: "2020-12-23",
  value: {
    appliesTo: ["apartment", "single_family_house"],
    summary:
      "For apartments and single-family homes bought by consumers, commission arrangements are regulated (§§ 656a–656d BGB). Whether and how much you pay depends on the specific contract.",
  },
  sourceName: "BGB §§ 656a–656d",
  sourceUrl: "https://www.gesetze-im-internet.de/bgb/__656c.html",
  lastVerifiedAt: "2026-10-04",
  verificationStatus: "secondary_source",
};

/** Rental: Bestellerprinzip (§ 2 Abs. 1a WoVermittG) — tenant pays only if they commissioned the agent. */
export const RENTAL_BROKER_RULE: RegulatoryRule<{ summary: string }> = {
  id: "de-wovermittg-2-1a",
  version: 1,
  jurisdiction: "DE",
  effectiveFrom: "2015-06-01",
  value: { summary: "For residential rentals, the party who commissioned the agent pays (Bestellerprinzip)." },
  sourceName: "WoVermittG § 2 Abs. 1a",
  sourceUrl: "https://www.gesetze-im-internet.de/wovermittg/__2.html",
  lastVerifiedAt: "2026-10-04",
  verificationStatus: "secondary_source",
};

/**
 * Mietpreisbremse (§ 556d BGB). Applicability depends on a state ordinance naming the
 * municipality, and exemptions (first letting after 1 Oct 2014 new build, comprehensive
 * modernisation, prior rent) — so the engine never concludes applicability on its own.
 */
export const RENT_CAP_RULE: RegulatoryRule<{ capAboveLocalReferencePct: number; summary: string }> = {
  id: "de-bgb-556d",
  version: 1,
  jurisdiction: "DE",
  effectiveFrom: "2015-06-01",
  value: {
    capAboveLocalReferencePct: 10,
    summary:
      "Where a state ordinance designates a tight housing market, new-tenancy rent may generally not exceed the local reference rent by more than 10%. Exemptions exist (e.g. new builds first let after 1 Oct 2014, comprehensive modernisation, higher previous rent).",
  },
  sourceName: "BGB § 556d ff.",
  sourceUrl: "https://www.gesetze-im-internet.de/bgb/__556d.html",
  lastVerifiedAt: "2026-10-04",
  verificationStatus: "secondary_source",
  notes: "Federal extension horizon and per-state ordinances must be tracked per municipality before showing any applicability hint.",
};
