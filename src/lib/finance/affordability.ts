/**
 * Indicative affordability engine. NOT a credit decision — real financing depends
 * on lender underwriting. All thresholds live in `AffordabilityConfig` so product,
 * compliance or a lending partner can tune them without code changes.
 */
import type { BrokerArrangement } from "./purchaseCosts";
import { closingCostRatio } from "./purchaseCosts";
import type { StateCode } from "../data/regulatory/transferTax";

export interface Household {
  netMonthlyIncome: number; // primary applicant, net
  partnerNetMonthlyIncome?: number;
  rentalIncome?: number; // lenders typically haircut rental income
  otherIncome?: number;
  adults: number;
  children: number;
  monthlyObligations: number; // consumer loans, car finance, childcare, insurance, other
  savings: number;
  giftContribution?: number;
  /** Cash the user wants to keep liquid after buying — never used as equity. */
  desiredReserve: number;
  employment?: "employed" | "self_employed" | "civil_servant" | "retired" | "other";
}

export interface AffordabilityConfig {
  /** Max share of net income for all housing costs + debts (theoretical ceiling). */
  maxDebtServiceRatio: number;
  /** Comfortable share used for the recommended budget. */
  comfortableDebtServiceRatio: number;
  /** Assumed living-cost allowance per adult/child (household budget, not housing). */
  livingCostPerAdult: number;
  livingCostPerChild: number;
  rentalIncomeHaircut: number; // share of rental income counted
  /** Max financed share of price (LTV) for the theoretical case. */
  maxLtv: number;
  /** Recommended max LTV. */
  recommendedLtv: number;
  /** Extra reserve kept on top of the user's reserve for the recommended budget (share of price). */
  recommendedExtraReservePct: number;
  /** Running costs (Hausgeld/maintenance/insurance/tax) as monthly share of price, plus fixed amount. */
  runningCostMonthlyPctOfPrice: number;
  runningCostMonthlyFixed: number;
  selfEmployedIncomeHaircut: number;
}

/** Defaults are product assumptions, displayed and editable — not lender policy. */
export const DEFAULT_AFFORDABILITY_CONFIG: AffordabilityConfig = {
  maxDebtServiceRatio: 0.45,
  comfortableDebtServiceRatio: 0.35,
  livingCostPerAdult: 900,
  livingCostPerChild: 350,
  rentalIncomeHaircut: 0.7,
  maxLtv: 1.0,
  recommendedLtv: 0.9,
  recommendedExtraReservePct: 0,
  runningCostMonthlyPctOfPrice: 0.0008, // ≈ €320/month per €400k
  runningCostMonthlyFixed: 0,
  selfEmployedIncomeHaircut: 0.9,
};

export interface FinancingAssumptions {
  annualRate: number; // from a MortgageRateProvider or the user
  initialRepayment: number;
  state: StateCode;
  broker: BrokerArrangement;
}

export type RiskRating = "comfortable" | "borderline" | "high_risk";
export type Confidence = "high" | "medium" | "low";

export interface BudgetPoint {
  price: number;
  loan: number;
  equityUsed: number;
  closingCosts: number;
  monthlyPayment: number;
  monthlyRunningCosts: number;
  monthlyHousingCost: number;
  cashRemaining: number;
  ltv: number;
  debtServiceRatio: number;
  limitedBy: "income" | "equity";
}

export interface AffordabilityResult {
  countedIncome: number;
  disposableBeforeHousing: number;
  availableEquityTheoretical: number;
  maximum: BudgetPoint;
  recommended: BudgetPoint;
  risk: RiskRating;
  confidence: Confidence;
  explanation: string[];
  disclaimer: string;
}

export function countedIncome(h: Household, cfg: AffordabilityConfig) {
  let income = h.netMonthlyIncome + (h.partnerNetMonthlyIncome ?? 0) + (h.otherIncome ?? 0);
  if (h.employment === "self_employed") income *= cfg.selfEmployedIncomeHaircut;
  return income + (h.rentalIncome ?? 0) * cfg.rentalIncomeHaircut;
}

/**
 * Largest price satisfying both
 *  (a) payment + running costs + obligations ≤ ratio × income and ≤ disposable income
 *  (b) loan ≤ ltv × price, where loan = price × (1 + closingRatio) − equity
 */
function solve(
  income: number,
  disposable: number,
  obligations: number,
  equity: number,
  ratio: number,
  ltv: number,
  f: FinancingAssumptions,
  cfg: AffordabilityConfig,
  reserveKept: number,
): BudgetPoint {
  const c = closingCostRatio(f.state, f.broker);
  const k = (f.annualRate + f.initialRepayment) / 12;
  const b = cfg.runningCostMonthlyPctOfPrice;
  const a = cfg.runningCostMonthlyFixed;
  const housingCap = Math.max(0, Math.min(ratio * income - obligations, disposable));
  const pIncome = (housingCap - a + k * equity) / (k * (1 + c) + b);
  const pEquity = 1 + c - ltv > 0 ? equity / (1 + c - ltv) : Infinity;
  const price = Math.max(0, Math.min(pIncome, pEquity));
  const closing = price * c;
  const loan = Math.max(0, price + closing - equity);
  const equityUsed = Math.min(equity, price + closing);
  const pay = loan * k;
  const running = a + b * price;
  return {
    price,
    loan,
    equityUsed,
    closingCosts: closing,
    monthlyPayment: pay,
    monthlyRunningCosts: running,
    monthlyHousingCost: pay + running,
    cashRemaining: reserveKept + (equity - equityUsed),
    ltv: price ? loan / price : 0,
    debtServiceRatio: income ? (pay + running + obligations) / income : 1,
    limitedBy: pIncome <= pEquity ? "income" : "equity",
  };
}

export function assessAffordability(
  h: Household,
  f: FinancingAssumptions,
  cfg: AffordabilityConfig = DEFAULT_AFFORDABILITY_CONFIG,
): AffordabilityResult {
  const income = countedIncome(h, cfg);
  const living = h.adults * cfg.livingCostPerAdult + h.children * cfg.livingCostPerChild;
  const disposable = income - living - h.monthlyObligations;
  const cash = h.savings + (h.giftContribution ?? 0);
  const reserve = Math.min(h.desiredReserve, cash);
  const equity = Math.max(0, cash - reserve);

  const maximum = solve(income, disposable, h.monthlyObligations, equity, cfg.maxDebtServiceRatio, cfg.maxLtv, f, cfg, reserve);
  let recommended = solve(income, disposable, h.monthlyObligations, equity, cfg.comfortableDebtServiceRatio, cfg.recommendedLtv, f, cfg, reserve);
  if (cfg.recommendedExtraReservePct > 0) {
    const extra = recommended.price * cfg.recommendedExtraReservePct;
    recommended = solve(income, disposable, h.monthlyObligations, Math.max(0, equity - extra), cfg.comfortableDebtServiceRatio, cfg.recommendedLtv, f, cfg, reserve + extra);
  }

  const dsr = recommended.debtServiceRatio;
  const risk: RiskRating =
    dsr <= cfg.comfortableDebtServiceRatio + 0.005 && recommended.ltv <= cfg.recommendedLtv + 0.001 ? "comfortable" : dsr <= cfg.maxDebtServiceRatio ? "borderline" : "high_risk";
  const confidence: Confidence =
    h.employment === "self_employed" || (h.rentalIncome ?? 0) > income * 0.3 ? "medium" : equity < recommended.closingCosts ? "low" : "high";

  const eur = (x: number) => `€${Math.round(x).toLocaleString("de-DE")}`;
  const explanation = [
    `We count ${eur(income)} monthly income${h.rentalIncome ? ` (rental income at ${cfg.rentalIncomeHaircut * 100}%)` : ""} and assume ${eur(living)} living costs for ${h.adults} adult(s) and ${h.children} child(ren).`,
    `Of your ${eur(cash)} available cash, ${eur(reserve)} stays as your reserve, so ${eur(equity)} can go towards the purchase.`,
    `You could potentially finance around ${eur(maximum.price)} (housing costs up to ${Math.round(cfg.maxDebtServiceRatio * 100)}% of income, limited by ${maximum.limitedBy}).`,
    `We recommend looking closer to ${eur(recommended.price)}: housing costs stay near ${Math.round(recommended.debtServiceRatio * 100)}% of income, the loan-to-value stays at or below ${Math.round(cfg.recommendedLtv * 100)}%, and you keep ${eur(recommended.cashRemaining)} in cash.`,
  ];
  if (equity < recommended.closingCosts)
    explanation.push("Your equity does not fully cover the purchase costs (Nebenkosten). Many lenders expect at least these to be paid from own funds.");

  return {
    countedIncome: income,
    disposableBeforeHousing: disposable,
    availableEquityTheoretical: equity,
    maximum,
    recommended,
    risk,
    confidence,
    explanation,
    disclaimer: "Indicative estimate. Not a credit decision. Actual financing depends on lender underwriting.",
  };
}

/** Signature feature: monthly housing budget → purchase price range. */
export function priceFromMonthlyBudget(
  monthlyBudget: number,
  equity: number,
  f: FinancingAssumptions,
  cfg: AffordabilityConfig = DEFAULT_AFFORDABILITY_CONFIG,
) {
  const c = closingCostRatio(f.state, f.broker);
  const k = (f.annualRate + f.initialRepayment) / 12;
  const b = cfg.runningCostMonthlyPctOfPrice;
  const price = Math.max(0, (monthlyBudget - cfg.runningCostMonthlyFixed + k * equity) / (k * (1 + c) + b));
  const closing = price * c;
  const loan = Math.max(0, price + closing - equity);
  return { price, closingCosts: closing, loan, monthlyPayment: loan * k, runningCosts: cfg.runningCostMonthlyFixed + b * price, ltv: price ? loan / price : 0 };
}
