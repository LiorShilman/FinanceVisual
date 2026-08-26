import type { FinancialEntity } from './entity';

export interface SavingsFromIncome {
  amount: number;
  income: number;
  // amount divided by income — uncapped, same convention as EssentialBurden.ratio.
  ratio: number;
}

/** The 50/30/20-style "20%": monthly contributions into investment/pension/study-fund entities,
 * counted only where the entity's own `fromIncome` flag says the money actually came out of the
 * household's tracked income — not, say, an employer-matched pension/keren-hishtalmut share that
 * never passed through the income figure at all. That flag is a per-household judgment call (see
 * entity.ts), not something this app can infer from the numbers alone. */
export function computeSavingsFromIncome(entities: FinancialEntity[]): SavingsFromIncome {
  let amount = 0;
  let income = 0;
  for (const e of entities) {
    if (
      (e.details.kind === 'savings' ||
        e.details.kind === 'investment' ||
        e.details.kind === 'pension' ||
        e.details.kind === 'studyFund') &&
      e.details.fromIncome
    ) {
      amount += e.details.monthlyContribution;
    }
    if (e.details.kind === 'income') income += e.details.monthlyAmount;
  }
  return { amount, income, ratio: income > 0 ? amount / income : 0 };
}
