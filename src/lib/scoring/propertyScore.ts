/**
 * Transparent property score. Each component returns a 0–100 score with a
 * human-readable explanation, or `null` when we lack data — missing data is
 * excluded from the weighted average and listed, never guessed.
 */
import { listingQuality } from "../listings/quality";
import type { Listing } from "../listings/types";

export interface SearchProfile {
  name: string;
  transaction: "buy" | "rent";
  purpose: "owner_occupied" | "investment";
  maxPrice?: number;
  maxMonthly?: number; // monthly housing budget (buy) or max warm rent (rent)
  minRooms?: number;
  minArea?: number;
  cities?: string[];
  mustHave: string[]; // feature keys
  niceToHave: string[];
  avoidRenovation?: boolean;
  pets?: boolean;
  maxCommuteMin?: number;
  minGrossYield?: number; // investors
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  why: string;
}

export type ScoreWeights = Record<"affordability" | "match" | "quality" | "energy" | "commute" | "value" | "location", number>;

export const DEFAULT_WEIGHTS: ScoreWeights = { affordability: 25, match: 25, quality: 10, energy: 15, commute: 15, value: 10, location: 0 };
export const INVESTOR_WEIGHTS: ScoreWeights = { affordability: 20, match: 10, quality: 10, energy: 15, commute: 0, value: 45, location: 0 };

const ENERGY_SCORE: Record<string, number> = { "A+": 100, A: 95, B: 85, C: 72, D: 60, E: 48, F: 35, G: 22, H: 10 };
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export interface ScoreContext {
  monthlyCost?: number; // true monthly cost for this user (from the finance engine)
  commuteMin?: number;
  commuteMethod?: string;
  marketDiffPct?: number; // vs comparable median, from a MarketPriceProvider
  grossYield?: number;
}

export function propertyScore(l: Listing, p: SearchProfile, ctx: ScoreContext, weights: ScoreWeights = p.purpose === "investment" ? INVESTOR_WEIGHTS : DEFAULT_WEIGHTS) {
  const c: ScoreComponent[] = [];

  // Affordability: how much headroom vs the user's monthly budget.
  if (ctx.monthlyCost != null && p.maxMonthly) {
    const ratio = ctx.monthlyCost / p.maxMonthly;
    c.push({ key: "affordability", label: "Affordability", weight: weights.affordability, score: clamp(ratio <= 0.8 ? 100 : ratio <= 1 ? 100 - (ratio - 0.8) * 150 : 70 - (ratio - 1) * 300), why: `Estimated €${Math.round(ctx.monthlyCost)}/month is ${Math.round(ratio * 100)}% of your €${p.maxMonthly} budget.` });
  } else c.push({ key: "affordability", label: "Affordability", weight: weights.affordability, score: null, why: "Set a monthly budget to score affordability." });

  // Preference match.
  const missingMust = p.mustHave.filter((f) => !l.features.includes(f));
  const nice = p.niceToHave.filter((f) => l.features.includes(f));
  let m = 100 - missingMust.length * 25;
  if (p.niceToHave.length) m = m * 0.8 + (nice.length / p.niceToHave.length) * 20;
  if (p.minRooms && l.rooms != null && l.rooms < p.minRooms) m -= 30;
  if (p.minArea && l.livingArea != null && l.livingArea < p.minArea) m -= 20;
  if (p.avoidRenovation && l.condition === "needs_renovation") m -= 30;
  const reasons = [
    missingMust.length ? `missing must-haves: ${missingMust.join(", ")}` : "all must-haves present",
    p.niceToHave.length ? `${nice.length}/${p.niceToHave.length} nice-to-haves` : null,
    p.avoidRenovation && l.condition === "needs_renovation" ? "needs renovation, which you want to avoid" : null,
  ].filter(Boolean);
  c.push({ key: "match", label: "Match to your preferences", weight: weights.match, score: clamp(m), why: reasons.join("; ") + "." });

  const q = listingQuality(l);
  c.push({ key: "quality", label: "Listing completeness", weight: weights.quality, score: q.score, why: q.missing.length ? `Missing: ${q.missing.map((x) => x.label).join(", ")}.` : "All key information provided." });

  const ec = l.energy?.class;
  c.push({ key: "energy", label: "Energy efficiency", weight: weights.energy, score: ec ? ENERGY_SCORE[ec] : null, why: ec ? `Energy class ${ec}${l.energy?.kwhPerSqmYear ? ` (${l.energy.kwhPerSqmYear} kWh/m²a)` : ""}.` : "No energy class provided." });

  c.push(
    ctx.commuteMin != null
      ? { key: "commute", label: "Commute", weight: weights.commute, score: clamp(p.maxCommuteMin ? 100 - Math.max(0, ctx.commuteMin - p.maxCommuteMin * 0.6) * (100 / (p.maxCommuteMin * 0.8)) : 100 - ctx.commuteMin), why: `≈${Math.round(ctx.commuteMin)} min (${ctx.commuteMethod ?? "estimate"}).` }
      : { key: "commute", label: "Commute", weight: weights.commute, score: null, why: "Add a destination to score commute." },
  );

  if (p.purpose === "investment" && ctx.grossYield != null)
    c.push({ key: "value", label: "Yield", weight: weights.value, score: clamp((ctx.grossYield / (p.minGrossYield ?? 0.045)) * 80), why: `Gross yield ${(ctx.grossYield * 100).toFixed(1)}% vs your ${((p.minGrossYield ?? 0.045) * 100).toFixed(1)}% target.` });
  else
    c.push(
      ctx.marketDiffPct != null
        ? { key: "value", label: "Value for money", weight: weights.value, score: clamp(70 - ctx.marketDiffPct * 2), why: `Asking €/m² is ${ctx.marketDiffPct > 0 ? "+" : ""}${ctx.marketDiffPct.toFixed(1)}% vs local comparables (indicative).` }
        : { key: "value", label: "Value for money", weight: weights.value, score: null, why: "No comparable market data available for this area yet." },
    );

  const scored = c.filter((x) => x.score != null && x.weight > 0);
  const totalW = scored.reduce((s, x) => s + x.weight, 0);
  const overall = totalW ? Math.round(scored.reduce((s, x) => s + (x.score as number) * x.weight, 0) / totalW) : null;
  return { overall, components: c, excluded: c.filter((x) => x.score == null).map((x) => x.label) };
}
