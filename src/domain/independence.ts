import { getGrowthMonthlyContribution, isGrowthAssetDetails, type FinancialEntity } from './entity';
import { computeNetWorthBreakdown } from './netWorth';

// the "300 rule" (equivalently, the 4% safe-withdrawal rule: 1/0.04 = 25 years, ×12 months = 300)
// — essential monthly expenses only, not every expense, since discretionary spending is exactly
// the kind of thing that shrinks or stops once someone actually retires; using total spending
// would overstate the real target.
const INDEPENDENCE_MULTIPLIER = 300;
// stop projecting forward after this many years and call it "not on track" rather than loop
// (near-)forever for someone whose deposits+return can't outpace their own target.
const MAX_PROJECTION_YEARS = 100;

export interface IndependenceProgress {
  current: number;
  target: number;
  // uncapped — can exceed 1 once someone's already past their number; the dome fill itself clamps
  // this for rendering, but the real percentage is worth showing as-is.
  progress: number;
  // what a 4%-a-year safe withdrawal off *today's* current balance actually looks like per
  // month — current/300 (the same 300 multiplier, just read the other direction). Lets someone
  // compare that figure directly against their real essential monthly spend, rather than only
  // seeing an abstract percentage.
  monthlySafeWithdrawal: number;
  // the real number behind the target (target/300 gives this back exactly, but showing it
  // directly means someone doesn't have to do that division themselves to see, in ₪, how far
  // monthlySafeWithdrawal still has to climb).
  essentialMonthlyExpenses: number;
  // years until `current`, growing at the liquid growth entities' own balance-weighted average
  // return plus their real monthly contributions, reaches `target` — 0 if already there, null if
  // it won't get there within MAX_PROJECTION_YEARS at the current pace (e.g. no deposits and a
  // 0% average return).
  yearsToIndependence: number | null;
}

/** Shared with domain/emergencyFund.ts — "how much do I actually need to keep living" is the
 * same real-world number whether it's being multiplied by 300 for the FI target or compared
 * against an emergency fund's balance for a runway. Insurance and debt both count only when their
 * own `essential` flag says so (see entity.ts's InsuranceDetails/DebtDetails — a per-entity
 * judgment call, not a blanket rule by type): disability insurance replaces lost *work* income
 * and usually stops mattering once independent, most debt (a mortgage, a car loan) is assumed to
 * get paid off before independence — but neither is true for every policy/debt of that kind (a
 * life policy meant only to bridge to pension age, an ongoing legal obligation like alimony that
 * doesn't behave like typical amortizing debt at all), so it's the household's own call per
 * entity, not this function's. */
export function computeEssentialMonthlyExpenses(entities: FinancialEntity[]): number {
  let essentialMonthly = 0;
  for (const e of entities) {
    if (e.details.kind === 'expense' && e.details.essential) essentialMonthly += e.details.monthlyAmount;
    if (e.details.kind === 'insurance' && e.details.essential) essentialMonthly += e.details.monthlyPremium;
    if (e.details.kind === 'debt' && e.details.essential) essentialMonthly += e.details.monthlyPayment;
  }
  return essentialMonthly;
}

export function computeIndependenceProgress(entities: FinancialEntity[]): IndependenceProgress {
  const essentialMonthly = computeEssentialMonthlyExpenses(entities);
  // liquidOnly, not total — pension is locked until retirement age, so it can't actually fund the
  // years between "stop working" and "pension unlocks"; counting it would overstate how close
  // someone really is to being able to live off their own accessible money today.
  const current = computeNetWorthBreakdown(entities).liquidOnly;
  const target = essentialMonthly * INDEPENDENCE_MULTIPLIER;

  return {
    current,
    target,
    progress: target > 0 ? current / target : 0,
    monthlySafeWithdrawal: current / INDEPENDENCE_MULTIPLIER,
    essentialMonthlyExpenses: essentialMonthly,
    yearsToIndependence: computeYearsToIndependence(entities, current, target),
  };
}

/** Projects `current` forward month by month — at the *liquid* growth entities' own real monthly
 * contributions and balance-weighted average return (pension excluded, same as `current` itself,
 * since a pension contribution grows money that still can't be touched) — until it reaches
 * `target`. A balance-weighted average (not a flat average across entities) mirrors how a
 * mortgage's blended rate is computed elsewhere in this app: a ₪900k account at 7% and a ₪100k
 * account at 1% is much closer to a 6.4% blended return than a naive 4% average of the two. */
function computeYearsToIndependence(entities: FinancialEntity[], current: number, target: number): number | null {
  if (target <= 0) return null;
  if (current >= target) return 0;

  let balanceSum = 0;
  let weightedReturnSum = 0;
  let monthlyDeposit = 0;
  for (const e of entities) {
    if (!isGrowthAssetDetails(e.details) || e.details.kind === 'pension') continue;
    balanceSum += e.details.balance;
    weightedReturnSum += e.details.balance * e.details.expectedAnnualReturnPct;
    monthlyDeposit += getGrowthMonthlyContribution(e.details);
  }
  const avgAnnualReturnPct = balanceSum > 0 ? weightedReturnSum / balanceSum : 0;
  const monthlyRate = avgAnnualReturnPct / 100 / 12;

  let balance = current;
  for (let month = 1; month <= MAX_PROJECTION_YEARS * 12; month++) {
    balance = balance * (1 + monthlyRate) + monthlyDeposit;
    if (balance >= target) return month / 12;
  }
  return null;
}
