import { ruleInForce, type RegulatoryRule } from "./types";

/**
 * Grunderwerbsteuer by Bundesland. The legal basis is §11 GrEStG (federal), with the
 * rate set by each state under Art. 105 Abs. 2a GG.
 *
 * Last checked 2026-10-04 against secondary sources (multiple published 2026 tables);
 * official state law gazettes must be checked before production
 * (verificationStatus = "secondary_source").
 */
export const STATES = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bayern",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hessen",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Niedersachsen",
  "DE-NW": "Nordrhein-Westfalen",
  "DE-RP": "Rheinland-Pfalz",
  "DE-SL": "Saarland",
  "DE-SN": "Sachsen",
  "DE-ST": "Sachsen-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thüringen",
} as const;
export type StateCode = keyof typeof STATES;

const GENERIC_SOURCE = {
  sourceName: "GrEStG §11 + state rate laws",
  sourceUrl: "https://www.gesetze-im-internet.de/grestg_1983/__11.html",
  lastVerifiedAt: "2026-10-04",
  verificationStatus: "secondary_source" as const,
};

function rate(jurisdiction: StateCode, pct: number, effectiveFrom: string, effectiveTo?: string, notes?: string) {
  return { id: `grest-${jurisdiction}-${effectiveFrom}`, version: 1, jurisdiction, value: pct, effectiveFrom, effectiveTo, notes, ...GENERIC_SOURCE };
}

export const TRANSFER_TAX_RULES: RegulatoryRule<number>[] = [
  rate("DE-BW", 5.0, "2011-11-05"),
  rate("DE-BY", 3.5, "1997-01-01"),
  rate("DE-BE", 6.0, "2014-01-01"),
  rate("DE-BB", 6.5, "2015-07-01"),
  rate("DE-HB", 5.0, "2014-01-01", "2025-07-01"),
  rate("DE-HB", 5.5, "2025-07-01", undefined, "Raised from 5.0% on 1 July 2025."),
  rate("DE-HH", 5.5, "2023-01-01"),
  rate("DE-HE", 6.0, "2014-08-01"),
  rate("DE-MV", 6.0, "2019-07-01"),
  rate("DE-NI", 5.0, "2014-01-01"),
  rate("DE-NW", 6.5, "2015-01-01"),
  rate("DE-RP", 5.0, "2012-03-01"),
  rate("DE-SL", 6.5, "2015-01-01"),
  rate("DE-SN", 5.5, "2023-01-01"),
  rate("DE-ST", 5.0, "2012-03-01"),
  rate("DE-SH", 6.5, "2014-01-01"),
  rate("DE-TH", 6.5, "2017-01-01", "2024-01-01"),
  rate("DE-TH", 5.0, "2024-01-01", undefined, "Reduced from 6.5% on 1 January 2024."),
];

export function transferTaxRule(state: StateCode, on?: Date) {
  const r = ruleInForce(TRANSFER_TAX_RULES, state, on);
  if (!r) throw new Error(`No transfer tax rule for ${state}`);
  return r;
}

export const TRANSFER_TAX_EXPLANATION =
  "Grunderwerbsteuer is set by each Bundesland, so the rate depends on where the property is. " +
  "It is charged on the purchase price (movable items such as a fitted kitchen may be excluded if separately priced and reasonable).";
