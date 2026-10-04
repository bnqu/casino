import { NOTARY_LAND_REGISTER } from "../data/regulatory/acquisitionRules";
import { transferTaxRule, type StateCode } from "../data/regulatory/transferTax";

/** Broker arrangement is per transaction — never assume a national default. */
export type BrokerArrangement =
  | { kind: "none" }
  | { kind: "buyer_pct"; pct: number } // buyer pays pct of price (incl. VAT)
  | { kind: "split"; totalPct: number } // seller/buyer split half each
  | { kind: "fixed"; amount: number };

export interface PurchaseCostInput {
  price: number;
  state: StateCode;
  broker: BrokerArrangement;
  /** Overrides of the planning approximations, in % of price. */
  notaryPct?: number;
  landRegisterPct?: number;
  /** Price share for separately priced movables (e.g. kitchen) excluded from transfer tax. */
  movablesExcludedFromTax?: number;
  renovation?: number;
  financingCosts?: number; // e.g. valuation/appraisal fees
  otherCosts?: number;
  on?: Date;
}

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  pct?: number;
  basis: string;
  sourceUrl?: string;
}

export interface PurchaseCostResult {
  lines: CostLine[];
  closingCosts: number; // Nebenkosten (tax, notary, register, broker)
  totalCashRequirement: number; // price + all costs
  transferTaxPct: number;
  transferTaxRuleId: string;
}

export function brokerAmount(price: number, broker: BrokerArrangement) {
  switch (broker.kind) {
    case "none":
      return 0;
    case "buyer_pct":
      return (price * broker.pct) / 100;
    case "split":
      return (price * broker.totalPct) / 2 / 100;
    case "fixed":
      return broker.amount;
  }
}

export function purchaseCosts(input: PurchaseCostInput): PurchaseCostResult {
  const rule = transferTaxRule(input.state, input.on);
  const taxBase = Math.max(0, input.price - (input.movablesExcludedFromTax ?? 0));
  const notaryPct = input.notaryPct ?? NOTARY_LAND_REGISTER.value.notaryPct;
  const registerPct = input.landRegisterPct ?? NOTARY_LAND_REGISTER.value.landRegisterPct;
  const broker = brokerAmount(input.price, input.broker);
  const lines: CostLine[] = [
    { key: "price", label: "Kaufpreis", amount: input.price, basis: "Input" },
    {
      key: "transfer_tax",
      label: "Grunderwerbsteuer",
      amount: (taxBase * rule.value) / 100,
      pct: rule.value,
      basis: `${rule.value}% in ${input.state} since ${rule.effectiveFrom}`,
      sourceUrl: rule.sourceUrl,
    },
    { key: "notary", label: "Notar", amount: (input.price * notaryPct) / 100, pct: notaryPct, basis: "Planning approximation (GNotKG)", sourceUrl: NOTARY_LAND_REGISTER.sourceUrl },
    { key: "land_register", label: "Grundbuch", amount: (input.price * registerPct) / 100, pct: registerPct, basis: "Planning approximation (GNotKG)", sourceUrl: NOTARY_LAND_REGISTER.sourceUrl },
    { key: "broker", label: "Maklerprovision", amount: broker, pct: input.price ? (broker / input.price) * 100 : 0, basis: brokerBasis(input.broker) },
  ];
  if (input.financingCosts) lines.push({ key: "financing", label: "Finanzierungskosten", amount: input.financingCosts, basis: "Input" });
  if (input.renovation) lines.push({ key: "renovation", label: "Renovierung / Sofortmaßnahmen", amount: input.renovation, basis: "Input" });
  if (input.otherCosts) lines.push({ key: "other", label: "Sonstige Kosten", amount: input.otherCosts, basis: "Input" });
  const closing = lines.filter((l) => ["transfer_tax", "notary", "land_register", "broker"].includes(l.key)).reduce((s, l) => s + l.amount, 0);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, closingCosts: closing, totalCashRequirement: total, transferTaxPct: rule.value, transferTaxRuleId: rule.id };
}

function brokerBasis(b: BrokerArrangement) {
  switch (b.kind) {
    case "none":
      return "No broker / commission-free";
    case "buyer_pct":
      return `Buyer pays ${b.pct}%`;
    case "split":
      return `Split: ${b.totalPct}% total, buyer half`;
    case "fixed":
      return "Fixed amount";
  }
}

/** Closing-cost ratio (excl. renovation) used by budget solvers. */
export function closingCostRatio(state: StateCode, broker: BrokerArrangement, on?: Date) {
  const probe = 100_000;
  return purchaseCosts({ price: probe, state, broker, on }).closingCosts / probe;
}
