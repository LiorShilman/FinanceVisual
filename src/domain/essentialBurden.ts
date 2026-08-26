import { computeEssentialMonthlyExpenses } from './independence';
import type { FinancialEntity } from './entity';

export interface EssentialBurden {
  essentialExpenses: number;
  debtPayments: number;
  income: number;
  // essentialExpenses+debtPayments divided by income — uncapped, so a household paying out more
  // than it earns still shows its real (>100%) number rather than being silently clamped.
  ratio: number;
}

/** What share of real monthly income is already spoken for by unavoidable costs — essential
 * living expenses plus every debt's own monthly payment — before a single שקל of discretionary
 * spending or saving happens. The complement (1 − ratio) is the household's actual breathing
 * room. */
export function computeEssentialBurden(entities: FinancialEntity[]): EssentialBurden {
  const essentialExpenses = computeEssentialMonthlyExpenses(entities);

  let debtPayments = 0;
  let income = 0;
  for (const e of entities) {
    if (e.details.kind === 'debt') debtPayments += e.details.monthlyPayment;
    if (e.details.kind === 'income') income += e.details.monthlyAmount;
  }

  const burden = essentialExpenses + debtPayments;
  return {
    essentialExpenses,
    debtPayments,
    income,
    ratio: income > 0 ? burden / income : 0,
  };
}
