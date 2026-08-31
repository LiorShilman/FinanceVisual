import type { FinancialEntity } from './entity';

export interface EssentialBurden {
  essentialExpenses: number;
  debtPayments: number;
  insurancePremiums: number;
  income: number;
  // essentialExpenses+debtPayments+insurancePremiums divided by income — uncapped, so a household
  // paying out more than it earns still shows its real (>100%) number rather than being silently
  // clamped.
  ratio: number;
}

/** What share of real monthly income is already spoken for by unavoidable costs — essential
 * living expenses, every debt's own monthly payment, and every insurance policy's own monthly
 * premium — before a single שקל of discretionary spending or saving happens. Insurance has no
 * essential/non-essential flag of its own the way a plain expense does (unlike debt, which is
 * also counted unconditionally here), so every policy counts — an insurance premium chosen and
 * kept running is treated the same way debt payments already are: not optional in the moment,
 * regardless of whether the underlying policy itself was a discretionary choice. The complement
 * (1 − ratio) is the household's actual breathing room.
 *
 * Deliberately its own loop, not domain/independence.ts's computeEssentialMonthlyExpenses — that
 * function serves a different question ("every essential recurring cost, regardless of category",
 * for the financial-independence target) and already folds essential-flagged debt/insurance into
 * its own total. Reusing it here used to double-count: this function *also* adds every debt's
 * full payment and every insurance's full premium unconditionally right after, so any debt or
 * insurance entity with `essential: true` (insurance defaults to true — see entity.ts's
 * InsuranceDetails) was counted twice, inflating `needs` past what domain/budgetSplitTable.ts's
 * own row-by-row build of the same bucket showed (reported 2026-08-31: 50/30/20's own "needs"
 * figure on-screen didn't match the budget-split table's total for the same bucket). */
export function computeEssentialBurden(entities: FinancialEntity[]): EssentialBurden {
  let essentialExpenses = 0;
  let debtPayments = 0;
  let insurancePremiums = 0;
  let income = 0;
  for (const e of entities) {
    if (e.details.kind === 'expense' && e.details.essential) essentialExpenses += e.details.monthlyAmount;
    if (e.details.kind === 'debt') debtPayments += e.details.monthlyPayment;
    if (e.details.kind === 'insurance') insurancePremiums += e.details.monthlyPremium;
    if (e.details.kind === 'income') income += e.details.monthlyAmount;
  }

  const burden = essentialExpenses + debtPayments + insurancePremiums;
  return {
    essentialExpenses,
    debtPayments,
    insurancePremiums,
    income,
    ratio: income > 0 ? burden / income : 0,
  };
}
