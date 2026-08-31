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

// at or above this expected annual return, a contribution counts as real growth rather than just
// preserved. Raised from 3% (2026-08-31, explicit correction) — a plain money-market fund (קרן
// כספית), the safest, most cash-like instrument there is, was itself yielding ~3.5% at the time,
// so 3% let something that isn't really "advancing" anyone count as growth. 5%+ is where it
// actually becomes meaningful. A plain savings account (this app's own default
// expectedAnnualReturnPct is 1%, see domain/entity.ts's SavingsDetails) sits well below either
// threshold either way; a real investment/pension (default 7%/5%) sits at or above this one.
const GROWTH_RETURN_THRESHOLD_PCT = 5;

/** What share of the household's own "20%" (see computeSavingsFromIncome above) is actually
 * invested for real growth versus just parked somewhere near-zero-yield — the same ₪ saved into a
 * 1%-return savings account and a 7%-return investment both count identically toward the *rate*
 * above, but they mean something different for long-term wealth-building. Drives
 * CityCashFlowCurrent's own hue (see that file), not another separate number shown anywhere. 1
 * (reads as "fully growth") when there's no savings at all to have an opinion about — avoids a 0/0
 * default reading as the worst case instead of a neutral one. */
export function computeSavingsGrowthShare(entities: FinancialEntity[]): number {
  let growth = 0;
  let total = 0;
  for (const e of entities) {
    if (
      (e.details.kind === 'savings' || e.details.kind === 'investment' || e.details.kind === 'pension' || e.details.kind === 'studyFund') &&
      e.details.fromIncome
    ) {
      total += e.details.monthlyContribution;
      if (e.details.expectedAnnualReturnPct >= GROWTH_RETURN_THRESHOLD_PCT) growth += e.details.monthlyContribution;
    }
  }
  return total > 0 ? growth / total : 1;
}
