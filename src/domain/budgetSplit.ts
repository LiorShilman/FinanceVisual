import { computeEssentialBurden } from './essentialBurden';
import { computeSavingsFromIncome } from './savingsRate';
import type { FinancialEntity } from './entity';

export interface BudgetSplit {
  income: number;
  // essential expenses + every debt's own monthly payment + every insurance premium — the "50."
  needs: number;
  // non-essential expenses only — discretionary spending on yourself. The "30."
  wants: number;
  // savingsContribution + donations — the full "20%" bucket, using the common variant of the
  // 50/30/20 rule where the 20% is "money that isn't spent on today's lifestyle" (savings, debt
  // payoff, giving), not strictly savings alone. A tithe is carved OUT OF this 20%, not added on
  // top of it — the household still targets the same 20%, just splits it between building wealth
  // and giving some of it away.
  savings: number;
  // the actual-wealth-building slice of the 20% — fromIncome-flagged monthly contributions (see
  // domain/savingsRate.ts), not counting the donations slice below.
  savingsContribution: number;
  // the giving slice of the 20% (e.g. ma'aser/tithe) — kept separate from savingsContribution so
  // the visualization can show them as two distinct sub-bands within the same "20%" zone, rather
  // than implying it's all growing the household's own wealth.
  donations: number;
  // income minus the three above, floored at 0 — real money that isn't essential, isn't
  // discretionary spending, and isn't a tracked savings contribution (e.g. just sitting in
  // checking). Not folded into any other bucket — pretending it's "savings" or "wants" would be a
  // guess this app has no basis for.
  unallocated: number;
  // true when needs+wants+savings alone already exceed income, before even counting unallocated.
  overCommitted: boolean;
}

/** A 50/30/20-style breakdown of the household's own monthly income, built from three existing,
 * separately-verified pieces (essential burden, non-essential spending, and flagged savings
 * contributions) rather than a new parallel calculation. */
export function computeBudgetSplit(entities: FinancialEntity[]): BudgetSplit {
  const burden = computeEssentialBurden(entities);
  const savingsFromIncome = computeSavingsFromIncome(entities);

  let wants = 0;
  let donations = 0;
  for (const e of entities) {
    if (e.details.kind === 'expense' && !e.details.essential) wants += e.details.monthlyAmount;
    if (e.details.kind === 'donation') donations += e.details.monthlyAmount;
  }

  const income = burden.income;
  const needs = burden.essentialExpenses + burden.debtPayments + burden.insurancePremiums;
  const savingsContribution = savingsFromIncome.amount;
  const savings = savingsContribution + donations;
  const committed = needs + wants + savings;

  return {
    income,
    needs,
    wants,
    savings,
    savingsContribution,
    donations,
    unallocated: Math.max(0, income - committed),
    overCommitted: committed > income,
  };
}
