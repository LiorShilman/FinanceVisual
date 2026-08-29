import type { FinancialEntity } from './entity';

export interface DebtPayoffRow {
  id: string;
  name: string;
  outstandingBalance: number;
  monthlyPayment: number;
  interestRatePct: number;
  isMortgage: boolean;
  /** 1 = highest priority — see computeDebtPayoffPlan's own doc-comment for why this is avalanche
   * order (highest interest rate first), not snowball (smallest balance first). */
  priority: number;
  /** Whole months until this debt is fully paid off at its *current* monthlyPayment, assuming
   * nothing changes — standard fixed-payment amortization off the same three fields every debt
   * entity already carries (outstandingBalance/monthlyPayment/interestRatePct). null when the
   * payment doesn't even cover the interest accruing each month, so the balance would never
   * actually shrink (see neverPaysOff) — there's no "months" to report in that case. */
  monthsToPayoff: number | null;
  /** Total interest still to be paid over the rest of this debt's life at its current payment —
   * monthsToPayoff × monthlyPayment − outstandingBalance, the same approximation every consumer
   * amortization calculator uses (ignores the final month's real partial payment, off by at most
   * one month's payment). null alongside monthsToPayoff. */
  totalInterestRemaining: number | null;
  /** True when monthlyPayment doesn't even cover the interest that accrues each month at this
   * rate — the balance would grow, not shrink, no matter how many months pass, until the payment
   * itself increases. The single most important thing to flag for someone who doesn't know their
   * own numbers well: a debt that's quietly getting worse every month, not better. */
  neverPaysOff: boolean;
}

/** Standard fixed-payment loan amortization: how many whole months at `payment`/month it takes to
 * bring `balance` to zero at `annualRatePct` interest, and the total interest paid along the way.
 * The closed-form month count (rather than simulating month-by-month) is the textbook amortization
 * formula n = -ln(1 - r·P/A) / ln(1 + r); simulating would give the identical answer more slowly
 * and with more places to introduce a rounding bug. Exported for DebtPriorityPanel's own "what if I
 * paid X extra a month" simulator — same math, just re-run with a hypothetical bigger payment
 * against a real row's own real balance/rate, not a second calculation invented for the what-if. */
export function amortize(
  balance: number,
  payment: number,
  annualRatePct: number,
): { months: number | null; totalInterest: number | null; neverPaysOff: boolean } {
  if (balance <= 0) return { months: 0, totalInterest: 0, neverPaysOff: false };
  if (payment <= 0) return { months: null, totalInterest: null, neverPaysOff: true };

  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) {
    const months = Math.ceil(balance / payment);
    return { months, totalInterest: 0, neverPaysOff: false };
  }

  const firstMonthInterest = balance * monthlyRate;
  if (payment <= firstMonthInterest) return { months: null, totalInterest: null, neverPaysOff: true };

  const months = Math.ceil(-Math.log(1 - (monthlyRate * balance) / payment) / Math.log(1 + monthlyRate));
  const totalInterest = Math.max(0, months * payment - balance);
  return { months, totalInterest, neverPaysOff: false };
}

/**
 * The "avalanche" payoff order — every real debt (outstandingBalance > 0) ranked highest-interest-
 * rate-first. This is the order mainstream personal-finance advice (and the math) agrees actually
 * minimizes total interest paid, whichever debt any extra payment gets redirected to — the
 * "snowball" alternative (smallest-balance-first) exists purely for psychological motivation, not
 * because it saves money. Presenting one clear recommended order, not two competing ones with no
 * default, is deliberate: someone who doesn't already understand their own finances well needs a
 * single answer to "which one first," not another decision to make.
 */
export function computeDebtPayoffPlan(entities: FinancialEntity[]): DebtPayoffRow[] {
  const debts = entities.filter(
    (e): e is FinancialEntity & { details: Extract<FinancialEntity['details'], { kind: 'debt' }> } =>
      e.details.kind === 'debt' && e.details.outstandingBalance > 0,
  );

  const sorted = [...debts].sort((a, b) => {
    if (b.details.interestRatePct !== a.details.interestRatePct) return b.details.interestRatePct - a.details.interestRatePct;
    // tie-break on smaller balance first — a snowball-flavored nudge for the rare case of two
    // debts genuinely tied on rate, where clearing the smaller one first is a free motivational win.
    return a.details.outstandingBalance - b.details.outstandingBalance;
  });

  return sorted.map((e, i) => {
    const { months, totalInterest, neverPaysOff } = amortize(e.details.outstandingBalance, e.details.monthlyPayment, e.details.interestRatePct);
    return {
      id: e.id,
      name: e.name,
      outstandingBalance: e.details.outstandingBalance,
      monthlyPayment: e.details.monthlyPayment,
      interestRatePct: e.details.interestRatePct,
      isMortgage: e.details.isMortgage,
      priority: i + 1,
      monthsToPayoff: months,
      totalInterestRemaining: totalInterest,
      neverPaysOff,
    };
  });
}
