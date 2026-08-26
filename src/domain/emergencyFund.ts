import { computeEssentialMonthlyExpenses } from './independence';
import type { FinancialEntity } from './entity';

// the bottom of the standard "3-6 months" advice range — also the gauge's own red/green zone
// boundary (see CityEmergencyGauge.tsx, which imports this instead of hardcoding it separately).
export const RECOMMENDED_MIN_MONTHS = 3;

export interface EmergencyRunway {
  balance: number;
  essentialMonthlyExpenses: number;
  // null when there's no essential-expense data yet to divide by (same "nothing to compare
  // against yet" case as independence.ts's target).
  monthsOfRunway: number | null;
  // ₪ still needed to reach RECOMMENDED_MIN_MONTHS, not just "months covered" — the months figure
  // alone doesn't say what to actually do about it. 0 once the minimum is already met; null when
  // there's no essential-expense data to compare against.
  gapToRecommended: number | null;
}

/** How many months a household could keep paying its real, essential bills off its emergency
 * fund alone if every source of income stopped today — the one thing `isEmergencyFund` was
 * already tracking on savings entities without anything actually reading it back. Essential
 * expenses only (not every expense), same reasoning as the 300-rule target: discretionary
 * spending is exactly what a household in a real emergency would cut first. */
export function computeEmergencyRunway(entities: FinancialEntity[]): EmergencyRunway {
  let balance = 0;
  for (const e of entities) {
    if (e.details.kind === 'savings' && e.details.isEmergencyFund) balance += e.details.balance;
  }
  const essentialMonthlyExpenses = computeEssentialMonthlyExpenses(entities);
  const hasExpenseData = essentialMonthlyExpenses > 0;
  return {
    balance,
    essentialMonthlyExpenses,
    monthsOfRunway: hasExpenseData ? balance / essentialMonthlyExpenses : null,
    gapToRecommended: hasExpenseData
      ? Math.max(0, RECOMMENDED_MIN_MONTHS * essentialMonthlyExpenses - balance)
      : null,
  };
}
