import { test } from "node:test";
import assert from "node:assert/strict";
import { amortize, annuityPayment, monthsToRepay, refinanceScenarios, snapshotAt } from "../src/lib/finance/amortization";
import { purchaseCosts } from "../src/lib/finance/purchaseCosts";
import { assessAffordability, priceFromMonthlyBudget } from "../src/lib/finance/affordability";
import { rentVsBuy } from "../src/lib/finance/rentVsBuy";
import { investorAnalysis } from "../src/lib/finance/investor";
import { transferTaxRule } from "../src/lib/data/regulatory/transferTax";

const near = (a: number, b: number, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b}`);

test("annuity: 300k at 3.6% + 2% repayment → €1,400/month", () => {
  const r = amortize({ principal: 300_000, annualRate: 0.036, initialRepayment: 0.02, fixedYears: 10 });
  near(r.monthlyPayment, 1400, 0.01);
  near(r.firstMonthInterest, 900, 0.01);
  near(r.firstMonthPrincipal, 500, 0.01);
  // Closed form remaining balance after n months at fixed payment.
  const i = 0.003, n = 120, P = 1400;
  const closed = 300_000 * Math.pow(1 + i, n) - (P * (Math.pow(1 + i, n) - 1)) / i;
  near(r.balanceAtFixedEnd, closed, 0.01);
  near(snapshotAt(r, 10, 300_000).balance, closed, 0.01);
  near(r.interestDuringFixed + r.principalDuringFixed, 1400 * 120, 0.01);
  assert.ok(r.payoffMonths && r.payoffMonths > 300 && r.payoffMonths < 420);
});

test("special repayments shorten term and reduce interest", () => {
  const base = amortize({ principal: 300_000, annualRate: 0.036, initialRepayment: 0.02, fixedYears: 10 });
  const extra = amortize({ principal: 300_000, annualRate: 0.036, initialRepayment: 0.02, fixedYears: 10, annualSpecialRepayment: 5_000 });
  assert.ok(extra.payoffMonths! < base.payoffMonths!);
  assert.ok(extra.totalInterest < base.totalInterest);
});

test("annuity helpers are inverse", () => {
  const p = annuityPayment(200_000, 0.05, 240);
  assert.equal(monthsToRepay(200_000, 0.05, p), 240);
  assert.equal(monthsToRepay(200_000, 0.05, 800), null); // below interest
});

test("refinancing scenarios increase with rate", () => {
  const r = refinanceScenarios({ principal: 300_000, annualRate: 0.036, initialRepayment: 0.02, fixedYears: 10 });
  for (let k = 1; k < r.scenarios.length; k++) assert.ok(r.scenarios[k].paymentSamePayoff > r.scenarios[k - 1].paymentSamePayoff);
});

test("transfer tax is state- and date-specific", () => {
  assert.equal(transferTaxRule("DE-BY").value, 3.5);
  assert.equal(transferTaxRule("DE-HB", new Date("2025-06-30")).value, 5.0);
  assert.equal(transferTaxRule("DE-HB", new Date("2025-07-01")).value, 5.5);
  assert.equal(transferTaxRule("DE-TH", new Date("2023-12-31")).value, 6.5);
  const c = purchaseCosts({ price: 500_000, state: "DE-BE", broker: { kind: "split", totalPct: 7.14 } });
  near(c.lines.find((l) => l.key === "transfer_tax")!.amount, 30_000);
  near(c.lines.find((l) => l.key === "broker")!.amount, 17_850);
  near(c.closingCosts, 30_000 + 7_500 + 2_500 + 17_850);
});

test("no broker means zero commission — never a default", () => {
  const c = purchaseCosts({ price: 400_000, state: "DE-BY", broker: { kind: "none" } });
  assert.equal(c.lines.find((l) => l.key === "broker")!.amount, 0);
});

test("affordability: recommended ≤ maximum, reserve preserved", () => {
  const r = assessAffordability(
    { netMonthlyIncome: 5500, adults: 1, children: 0, monthlyObligations: 0, savings: 80_000, desiredReserve: 20_000 },
    { annualRate: 0.037, initialRepayment: 0.02, state: "DE-BE", broker: { kind: "split", totalPct: 7.14 } },
  );
  assert.ok(r.recommended.price <= r.maximum.price);
  assert.ok(r.recommended.cashRemaining >= 20_000);
  assert.ok(r.maximum.monthlyHousingCost <= 0.45 * 5500 + 0.01);
  assert.match(r.disclaimer, /Not a credit decision/);
});

test("monthly budget → price round-trips", () => {
  const f = { annualRate: 0.037, initialRepayment: 0.02, state: "DE-BY" as const, broker: { kind: "none" as const } };
  const r = priceFromMonthlyBudget(2200, 100_000, f);
  near(r.monthlyPayment + r.runningCosts, 2200, 0.01);
});

test("rent vs buy produces rows and a sane break-even", () => {
  const r = rentVsBuy({ monthlyRent: 1500, rentIncrease: 0.02, price: 450_000, closingCosts: 45_000, equity: 120_000, annualRate: 0.037, initialRepayment: 0.02, fixedYears: 10, investmentReturn: 0.05, appreciation: 0.02, maintenancePctOfPrice: 0.01, hausgeldMonthly: 250, propertyTaxYearly: 400, insuranceYearly: 0, sellingCostPct: 0.05, years: 30 });
  assert.equal(r.rows.length, 30);
  assert.ok(r.rows[0].buyerNetWorth < r.rows[0].renterNetWorth, "transaction costs make year 1 worse for buyer");
});

test("investor yields", () => {
  const r = investorAnalysis({ price: 300_000, closingCosts: 30_000, renovation: 0, equity: 60_000, annualRate: 0.04, initialRepayment: 0.02, fixedYears: 10, coldRentMonthly: 1000, vacancyRate: 0, nonRecoverableHausgeldMonthly: 0, maintenanceYearly: 0, managementYearly: 0, propertyTaxNonRecoverableYearly: 0, insuranceNonRecoverableYearly: 0, appreciation: 0, rentGrowth: 0, sellingCostPct: 0 });
  near(r.grossYield, 0.04, 1e-9);
  near(r.debtService, 270_000 * 0.06, 1);
});
