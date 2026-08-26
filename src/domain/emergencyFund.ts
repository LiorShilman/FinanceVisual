import { computeEssentialMonthlyExpenses } from './independence';
import type { FinancialEntity } from './entity';

export interface EmergencyRunway {
  balance: number;
  essentialMonthlyExpenses: number;
  // null when there's no essential-expense data yet to divide by (same "nothing to compare
  // against yet" case as independence.ts's target).
  monthsOfRunway: number | null;
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
  return {
    balance,
    essentialMonthlyExpenses,
    monthsOfRunway: essentialMonthlyExpenses > 0 ? balance / essentialMonthlyExpenses : null,
  };
}
