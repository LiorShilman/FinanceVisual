import type { MortgageTrack } from './entity';

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface AmortizationResult {
  rows: AmortizationRow[];
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  payoffMonths: number;
  insufficientPayment: boolean;
}

// hard safety cap so a track whose payment barely outpaces its interest (a legitimate slow
// payoff, not a bug) still terminates in bounded time rather than simulating for centuries
const MAX_MONTHS = 600;

// standard equal-installment ("שפיצר") amortization: the monthly payment stays fixed, interest
// is charged on the remaining balance, and whatever's left of the payment reduces principal.
// simulated from the track's own stored balance/rate/payment rather than solved analytically,
// so it stays correct even when those three numbers don't perfectly satisfy the annuity formula
// (e.g. a user-entered payment that doesn't exactly match a textbook schedule).
export function computeAmortizationSchedule(track: MortgageTrack): AmortizationResult {
  const monthlyRate = track.interestRatePct / 100 / 12;
  const rows: AmortizationRow[] = [];
  let balance = track.outstandingBalance;
  let totalPayment = 0;
  let totalInterest = 0;
  let insufficientPayment = false;

  for (let month = 1; month <= MAX_MONTHS && balance > 0.5; month++) {
    const interest = balance * monthlyRate;
    let principal = track.monthlyPayment - interest;
    if (principal <= 0) {
      insufficientPayment = true;
      break;
    }
    if (principal > balance) principal = balance;
    const payment = principal + interest;
    balance = Math.max(0, balance - principal);
    rows.push({ month, payment, principal, interest, balance });
    totalPayment += payment;
    totalInterest += interest;
  }

  return {
    rows,
    totalPayment,
    totalInterest,
    totalPrincipal: totalPayment - totalInterest,
    payoffMonths: rows.length,
    insufficientPayment,
  };
}
