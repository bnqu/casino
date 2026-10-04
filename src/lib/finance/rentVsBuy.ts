/**
 * Rent vs buy, net-worth comparison. The renter invests the cash the buyer spends
 * up front, plus any monthly difference. Appreciation is a scenario input, never a
 * forecast.
 */
import { amortize } from "./amortization";

export interface RentVsBuyInput {
  monthlyRent: number;
  rentIncrease: number; // yearly, e.g. 0.02
  price: number;
  closingCosts: number;
  equity: number; // cash used incl. closing costs
  annualRate: number;
  initialRepayment: number;
  fixedYears: number;
  investmentReturn: number; // yearly on renter's investments
  appreciation: number; // yearly scenario
  maintenancePctOfPrice: number; // yearly
  hausgeldMonthly: number; // non-recoverable owner running costs
  propertyTaxYearly: number;
  insuranceYearly: number;
  sellingCostPct: number; // at exit
  years: number;
}

export interface YearRow {
  year: number;
  renterNetWorth: number;
  buyerNetWorth: number;
  homeValue: number;
  loanBalance: number;
  rentPaid: number;
  ownerCosts: number;
}

export function rentVsBuy(i: RentVsBuyInput) {
  const loan = Math.max(0, i.price + i.closingCosts - i.equity);
  const am = amortize({ principal: loan, annualRate: i.annualRate, initialRepayment: i.initialRepayment, fixedYears: i.fixedYears, maxMonths: i.years * 12 });
  const rm = Math.pow(1 + i.investmentReturn, 1 / 12) - 1;
  let renterPortfolio = i.equity; // renter keeps and invests the buyer's up-front cash
  let buyerPortfolio = 0;
  let rent = i.monthlyRent;
  let rentPaid = 0;
  let ownerCosts = 0;
  const rows: YearRow[] = [];
  for (let m = 1; m <= i.years * 12; m++) {
    if (m > 1 && (m - 1) % 12 === 0) rent *= 1 + i.rentIncrease;
    const year = Math.ceil(m / 12);
    const value = i.price * Math.pow(1 + i.appreciation, (m - 1) / 12);
    const own =
      (am.schedule[m - 1]?.payment ?? 0) + i.hausgeldMonthly + (i.maintenancePctOfPrice * value) / 12 + i.propertyTaxYearly / 12 + i.insuranceYearly / 12;
    rentPaid += rent;
    ownerCosts += own;
    renterPortfolio *= 1 + rm;
    buyerPortfolio *= 1 + rm;
    // Whoever pays less this month invests the difference.
    if (own > rent) renterPortfolio += own - rent;
    else buyerPortfolio += rent - own;
    if (m % 12 === 0) {
      const homeValue = i.price * Math.pow(1 + i.appreciation, year);
      const balance = am.schedule[m - 1]?.balance ?? 0;
      rows.push({
        year,
        renterNetWorth: renterPortfolio,
        buyerNetWorth: homeValue * (1 - i.sellingCostPct) - balance + buyerPortfolio,
        homeValue,
        loanBalance: balance,
        rentPaid,
        ownerCosts,
      });
    }
  }
  const be = rows.findIndex((r) => r.buyerNetWorth >= r.renterNetWorth);
  let breakEvenYears: number | null = null;
  if (be === 0) breakEvenYears = 1;
  else if (be > 0) {
    const a = rows[be - 1], b = rows[be];
    const da = a.buyerNetWorth - a.renterNetWorth, db = b.buyerNetWorth - b.renterNetWorth;
    breakEvenYears = a.year + -da / (db - da);
  }
  return { loan, rows, breakEvenYears };
}

export const RVB_SCENARIOS = {
  conservative: { appreciation: 0.0, investmentReturn: 0.05, rentIncrease: 0.015 },
  base: { appreciation: 0.015, investmentReturn: 0.05, rentIncrease: 0.02 },
  optimistic: { appreciation: 0.03, investmentReturn: 0.05, rentIncrease: 0.025 },
} as const;
