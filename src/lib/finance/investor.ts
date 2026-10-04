/** Investment property metrics — before tax. No personalised tax advice. */
import { amortize } from "./amortization";

export interface InvestorInput {
  price: number;
  closingCosts: number;
  renovation: number;
  equity: number;
  annualRate: number;
  initialRepayment: number;
  fixedYears: number;
  coldRentMonthly: number;
  vacancyRate: number; // e.g. 0.03
  nonRecoverableHausgeldMonthly: number;
  maintenanceYearly: number;
  managementYearly: number;
  propertyTaxNonRecoverableYearly: number;
  insuranceNonRecoverableYearly: number;
  appreciation: number; // scenario
  rentGrowth: number;
  sellingCostPct: number;
}

export function investorAnalysis(i: InvestorInput) {
  const totalCost = i.price + i.closingCosts + i.renovation;
  const loan = Math.max(0, totalCost - i.equity);
  const am = amortize({ principal: loan, annualRate: i.annualRate, initialRepayment: i.initialRepayment, fixedYears: i.fixedYears });
  const grossRent = i.coldRentMonthly * 12;
  const effectiveRent = grossRent * (1 - i.vacancyRate);
  const opex = i.nonRecoverableHausgeldMonthly * 12 + i.maintenanceYearly + i.managementYearly + i.propertyTaxNonRecoverableYearly + i.insuranceNonRecoverableYearly;
  const noi = effectiveRent - opex;
  const y1 = am.schedule.slice(0, 12);
  const interest1 = y1.reduce((s, r) => s + r.interest, 0);
  const principal1 = y1.reduce((s, r) => s + r.principal, 0);
  const debtService = interest1 + principal1;
  const cashFlow = noi - debtService;

  const horizon = (years: number) => {
    let cf = 0;
    for (let y = 1; y <= years; y++) {
      const rows = am.schedule.slice((y - 1) * 12, y * 12);
      const ds = rows.reduce((s, r) => s + r.payment, 0);
      cf += effectiveRent * Math.pow(1 + i.rentGrowth, y - 1) - opex * Math.pow(1.02, y - 1) - ds;
    }
    const value = i.price * Math.pow(1 + i.appreciation, years);
    const bal = am.schedule[years * 12 - 1]?.balance ?? 0;
    const equityAtExit = value * (1 - i.sellingCostPct) - bal;
    return { years, cumulativeCashFlow: cf, propertyValue: value, loanBalance: bal, equityAtExit, totalReturn: equityAtExit + cf - i.equity };
  };

  return {
    totalCost,
    loan,
    grossYield: grossRent / i.price,
    netYield: noi / totalCost,
    vacancyAdjustedIncome: effectiveRent,
    operatingCosts: opex,
    noi,
    debtService,
    interestYear1: interest1,
    principalYear1: principal1,
    cashFlowYearly: cashFlow,
    cashFlowMonthly: cashFlow / 12,
    cashOnCash: i.equity > 0 ? cashFlow / i.equity : null,
    scenarios: [horizon(10), horizon(20)],
    taxNote: "Before tax. After-tax results (AfA, interest deduction, income tax) need your personal tax situation — consult a Steuerberater.",
  };
}
