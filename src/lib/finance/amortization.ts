/**
 * German annuity loan (Annuitätendarlehen) engine, simulated month by month.
 *
 * Convention: the monthly rate is fixed from nominal interest + initial repayment
 * (Anfangstilgung): payment = loan × (interest + initialRepayment) / 12.
 * Interest is charged monthly at nominal/12 on the outstanding balance.
 */

export interface SpecialRepayment {
  /** Month index (1-based) at whose end the extra payment is made. */
  month: number;
  amount: number;
}

export interface PaymentChange {
  /** From this month (1-based) the regular payment becomes `payment`. */
  fromMonth: number;
  payment: number;
}

export interface LoanInput {
  principal: number;
  /** Nominal annual interest, e.g. 0.037 for 3.7 %. */
  annualRate: number;
  /** Initial annual repayment, e.g. 0.02 for 2 %. Ignored if `monthlyPayment` set. */
  initialRepayment?: number;
  monthlyPayment?: number;
  /** Fixed-interest period in years (Zinsbindung). */
  fixedYears: number;
  /** Annual special repayment (Sondertilgung), applied at each year end. */
  annualSpecialRepayment?: number;
  specialRepayments?: SpecialRepayment[];
  paymentChanges?: PaymentChange[];
  /** Simulation horizon cap in months. */
  maxMonths?: number;
}

export interface ScheduleRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  special: number;
  balance: number;
}

export interface YearSnapshot {
  year: number;
  balance: number;
  principalRepaid: number;
  interestPaid: number;
}

export interface AmortizationResult {
  monthlyPayment: number;
  annualDebtService: number;
  firstMonthInterest: number;
  firstMonthPrincipal: number;
  schedule: ScheduleRow[];
  yearly: YearSnapshot[];
  payoffMonths: number | null;
  totalInterest: number;
  /** Balance at end of fixed-interest period. */
  balanceAtFixedEnd: number;
  interestDuringFixed: number;
  principalDuringFixed: number;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

export function initialMonthlyPayment(principal: number, annualRate: number, initialRepayment: number) {
  return (principal * (annualRate + initialRepayment)) / 12;
}

/** Classic annuity: payment that fully repays `principal` in `months`. */
export function annuityPayment(principal: number, annualRate: number, months: number) {
  if (months <= 0) return principal;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Months to repay `principal` at a fixed `payment`, or null if never repaid. */
export function monthsToRepay(principal: number, annualRate: number, payment: number): number | null {
  const r = annualRate / 12;
  if (principal <= 0) return 0;
  if (r === 0) return Math.ceil(principal / payment);
  if (payment <= principal * r) return null;
  return Math.ceil(-Math.log(1 - (principal * r) / payment) / Math.log(1 + r));
}

export function amortize(input: LoanInput): AmortizationResult {
  const { principal, annualRate, fixedYears } = input;
  if (principal < 0 || annualRate < 0) throw new Error("principal and rate must be non-negative");
  const r = annualRate / 12;
  const base =
    input.monthlyPayment ?? initialMonthlyPayment(principal, annualRate, input.initialRepayment ?? 0.02);
  const maxMonths = input.maxMonths ?? 12 * 60;
  const specials = new Map<number, number>();
  for (const s of input.specialRepayments ?? []) specials.set(s.month, (specials.get(s.month) ?? 0) + s.amount);
  const changes = [...(input.paymentChanges ?? [])].sort((a, b) => a.fromMonth - b.fromMonth);

  const schedule: ScheduleRow[] = [];
  let balance = principal;
  let payment = base;
  let month = 0;
  while (balance > 0.005 && month < maxMonths) {
    month++;
    for (const c of changes) if (c.fromMonth === month) payment = c.payment;
    const interest = balance * r;
    let principalPart = Math.min(payment - interest, balance);
    if (principalPart < 0) principalPart = 0; // negative amortisation is not modelled — payment covers interest only
    balance -= principalPart;
    let special = specials.get(month) ?? 0;
    if (input.annualSpecialRepayment && month % 12 === 0) special += input.annualSpecialRepayment;
    special = Math.min(special, balance);
    balance -= special;
    schedule.push({ month, payment: interest + principalPart, interest, principal: principalPart, special, balance });
  }

  const yearly: YearSnapshot[] = [];
  let cumI = 0;
  let cumP = 0;
  for (const row of schedule) {
    cumI += row.interest;
    cumP += row.principal + row.special;
    if (row.month % 12 === 0) yearly.push({ year: row.month / 12, balance: row.balance, principalRepaid: cumP, interestPaid: cumI });
  }
  // Pad years after payoff so lookups at 25/30 years still work.
  const lastYear = Math.ceil(schedule.length / 12);
  if (schedule.length % 12 !== 0) yearly.push({ year: lastYear, balance: 0, principalRepaid: cumP, interestPaid: cumI });

  const fixedMonths = fixedYears * 12;
  const fixedRows = schedule.slice(0, fixedMonths);
  return {
    monthlyPayment: base,
    annualDebtService: base * 12,
    firstMonthInterest: schedule[0]?.interest ?? 0,
    firstMonthPrincipal: schedule[0]?.principal ?? 0,
    schedule,
    yearly,
    payoffMonths: balance <= 0.005 ? month : null,
    totalInterest: cumI,
    balanceAtFixedEnd: fixedRows.length < fixedMonths ? 0 : fixedRows[fixedRows.length - 1]?.balance ?? principal,
    interestDuringFixed: fixedRows.reduce((s, x) => s + x.interest, 0),
    principalDuringFixed: fixedRows.reduce((s, x) => s + x.principal + x.special, 0),
  };
}

export function snapshotAt(result: AmortizationResult, year: number, principal: number): YearSnapshot {
  const y = result.yearly.find((s) => s.year === year);
  if (y) return y;
  const last = result.yearly[result.yearly.length - 1];
  if (last && year > last.year) return { ...last, year, balance: 0 };
  return { year, balance: principal, principalRepaid: 0, interestPaid: 0 };
}

export const SCENARIO_RATES = [0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06];

export interface RefinanceScenario {
  rate: number;
  /** Payment to stay on the original payoff date. */
  paymentSamePayoff: number;
  /** Payment if the same monthly rate is kept: months to repay instead. */
  monthsAtSamePayment: number | null;
  deltaVsCurrent: number;
}

/**
 * Scenarios for the balance remaining at the end of the fixed-interest period.
 * These are what-if scenarios, NOT forecasts of future rates.
 */
export function refinanceScenarios(
  loan: LoanInput,
  rates: number[] = SCENARIO_RATES,
): { balance: number; remainingMonthsOriginalPlan: number | null; scenarios: RefinanceScenario[] } {
  const base = amortize(loan);
  const balance = base.balanceAtFixedEnd;
  const fixedMonths = loan.fixedYears * 12;
  const remaining = base.payoffMonths === null ? null : Math.max(base.payoffMonths - fixedMonths, 1);
  const horizon = remaining ?? 25 * 12;
  return {
    balance,
    remainingMonthsOriginalPlan: remaining,
    scenarios: rates.map((rate) => {
      const p = balance > 0 ? annuityPayment(balance, rate, horizon) : 0;
      return {
        rate,
        paymentSamePayoff: p,
        monthsAtSamePayment: balance > 0 ? monthsToRepay(balance, rate, base.monthlyPayment) : 0,
        deltaVsCurrent: p - base.monthlyPayment,
      };
    }),
  };
}
