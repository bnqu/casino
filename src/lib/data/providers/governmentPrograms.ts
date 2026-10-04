import type { ProviderResult } from "../provenance";
import type { GovernmentProgram, GovernmentProgramProvider } from "./types";

/**
 * Program catalogue. Program terms (rates, maximum amounts) change frequently, so
 * this catalogue deliberately stores NO interest rates and only describes maximum
 * amounts qualitatively. Conditions must be read from the linked KfW Merkblatt.
 * Replace with a maintained feed (e.g. an ops-curated table or partner API).
 */
const DISCLAIMER =
  "Potential match only — eligibility is decided by KfW and your financing partner. Conditions change; check the official Merkblatt before relying on them.";

export const PROGRAM_CATALOGUE: GovernmentProgram[] = [
  {
    id: "kfw-308",
    provider: "KfW",
    code: "308",
    name: "Jung kauft Alt — Wohneigentum für Familien (Bestandserwerb)",
    purpose: "Purchase of an existing, energy-inefficient home by families with children, combined with an energy renovation.",
    eligibilitySummary: [
      "At least one child under 18 in the household",
      "Taxable household income under the program cap (depends on number of children)",
      "No existing residential property owned at application",
      "Owner-occupied; energy class F, G or H at purchase",
      "Renovation to the required efficiency standard within the program deadline",
    ],
    maxAmountNote: "Depends on the number of children — see the current Merkblatt.",
    applicationRules: ["Apply via your bank before signing the purchase contract", "Energy consultant involvement required for the renovation"],
    combinable: "Combinable with certain other programs (e.g. renovation subsidies) — see Merkblatt.",
    sourceUrl: "https://www.kfw.de/308",
    lastUpdated: "2026-10-04",
    verificationStatus: "secondary_source",
    disclaimer: DISCLAIMER,
    matchHints: { ownerOccupiedOnly: true, requiresChildren: true, existingOnly: true, maxEnergyClass: "F", householdTaxableIncomeCap: { base: 90_000, perChild: 10_000 } },
  },
  {
    id: "kfw-300",
    provider: "KfW",
    code: "300",
    name: "Wohneigentum für Familien (Neubau)",
    purpose: "Construction or first-time purchase of a climate-friendly new home by families with children.",
    eligibilitySummary: [
      "At least one child under 18 in the household",
      "Taxable household income under the program cap",
      "New build meeting the program's climate-friendly building standard",
      "Owner-occupied",
    ],
    maxAmountNote: "Depends on number of children and building standard — see Merkblatt.",
    applicationRules: ["Apply via your bank before the construction/purchase contract"],
    combinable: "See Merkblatt.",
    sourceUrl: "https://www.kfw.de/300",
    lastUpdated: "2026-10-04",
    verificationStatus: "unverified",
    disclaimer: DISCLAIMER,
    matchHints: { ownerOccupiedOnly: true, requiresChildren: true, newBuildOnly: true, householdTaxableIncomeCap: { base: 90_000, perChild: 10_000 } },
  },
  {
    id: "kfw-124",
    provider: "KfW",
    code: "124",
    name: "Wohneigentumsprogramm",
    purpose: "Purchase or construction of owner-occupied residential property.",
    eligibilitySummary: ["Owner-occupied residential property in Germany", "Private individuals"],
    maxAmountNote: "Capped per project — see Merkblatt.",
    applicationRules: ["Apply via your bank before signing the purchase contract"],
    combinable: "Commonly combined with bank financing.",
    sourceUrl: "https://www.kfw.de/124",
    lastUpdated: "2026-10-04",
    verificationStatus: "unverified",
    disclaimer: DISCLAIMER,
    matchHints: { ownerOccupiedOnly: true },
  },
];

export class StaticCatalogueProgramProvider implements GovernmentProgramProvider {
  async listPrograms(): Promise<ProviderResult<GovernmentProgram[]>> {
    return {
      ok: true,
      value: PROGRAM_CATALOGUE,
      provenance: { sourceName: "ImmoKnauer program catalogue (curated from kfw.de)", sourceUrl: "https://www.kfw.de", kind: "official_program", retrievedAt: "2026-10-04", confidence: "low", disclaimer: DISCLAIMER },
      freshness: "aging",
    };
  }
}

const CLASSES = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];

export interface ProgramMatchInput {
  ownerOccupied: boolean;
  children: number;
  newBuild: boolean;
  energyClass?: string;
  householdTaxableIncome?: number;
}

/** Returns programs the user MAY qualify for, with reasons and unknowns. */
export function matchPrograms(programs: GovernmentProgram[], u: ProgramMatchInput) {
  const out: { program: GovernmentProgram; reasons: string[]; unknowns: string[] }[] = [];
  for (const p of programs) {
    const h = p.matchHints;
    const reasons: string[] = [];
    const unknowns: string[] = [];
    if (h.ownerOccupiedOnly) {
      if (!u.ownerOccupied) continue;
      reasons.push("You plan to live in the property yourself");
    }
    if (h.requiresChildren) {
      if (u.children < 1) continue;
      reasons.push(`Your household includes ${u.children} child(ren)`);
    }
    if (h.newBuildOnly) {
      if (!u.newBuild) continue;
      reasons.push("The property is a new build");
    }
    if (h.existingOnly) {
      if (u.newBuild) continue;
      reasons.push("The property is an existing building");
    }
    if (h.maxEnergyClass) {
      if (!u.energyClass) unknowns.push("Energy class unknown");
      else if (CLASSES.indexOf(u.energyClass) < CLASSES.indexOf(h.maxEnergyClass)) continue;
      else reasons.push(`Energy class ${u.energyClass} is in the eligible range`);
    }
    if (h.householdTaxableIncomeCap) {
      const cap = h.householdTaxableIncomeCap.base + Math.max(0, u.children - 1) * h.householdTaxableIncomeCap.perChild;
      if (u.householdTaxableIncome == null) unknowns.push("Taxable household income not provided");
      else if (u.householdTaxableIncome > cap) continue;
      else reasons.push("Your stated taxable income appears below the program cap");
    }
    out.push({ program: p, reasons, unknowns });
  }
  return out;
}
