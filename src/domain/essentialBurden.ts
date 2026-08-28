import { computeEssentialMonthlyExpenses } from './independence';
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
 * (1 − ratio) is the household's actual breathing room. */
export function computeEssentialBurden(entities: FinancialEntity[]): EssentialBurden {
  const essentialExpenses = computeEssentialMonthlyExpenses(entities);

  let debtPayments = 0;
  let insurancePremiums = 0;
  let income = 0;
  for (const e of entities) {
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
