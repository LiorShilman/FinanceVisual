import type { FinancialEntity } from './entity';
import type { MonthlyTransactions } from './riseupSuggestions';

export interface UpcomingCharge {
  entityId: string;
  label: string;
  amount: number;
  date: Date;
  daysFromToday: number;
}

export interface CashRunway {
  nextPaydayDate: Date;
  daysUntilPayday: number;
  /** Sorted by date, ascending — every one of these lands on or before nextPaydayDate. */
  upcomingCharges: UpcomingCharge[];
  recommendedBalance: number;
  currentBalance: number;
  /** currentBalance / recommendedBalance, clamped to [0, 1.4] — the cap keeps a big cash cushion
   * from stretching the color gradient's "comfortably ahead" end past where it reads as meaningful. */
  ratio: number;
}

function dayOfMonth(iso: string): number {
  return new Date(iso).getDate();
}

/** The middle value, not the mean — one early/late outlier (a salary that landed a day early over
 * a weekend, a bill charged a few days late once) shouldn't drag the whole projection off the
 * date it actually lands on every other month. */
function medianDay(days: number[]): number {
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** The next real calendar date `targetDay` falls on, starting from `today` — this month if
 * `today` hasn't reached it yet, otherwise next month. Clamped to the target month's own last day
 * (a day-31 salary in a 30-day month lands on the 30th, not rolled over into the next month). */
function projectNextOccurrence(today: Date, targetDay: number): Date {
  const year = today.getFullYear();
  const month = today.getMonth();
  const thisMonthDay = Math.min(targetDay, daysInMonth(year, month));
  if (today.getDate() < thisMonthDay) return new Date(year, month, thisMonthDay);
  const nextMonthDay = Math.min(targetDay, daysInMonth(year, month + 1));
  return new Date(year, month + 1, nextMonthDay);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function amountFieldFor(details: FinancialEntity['details']): number | null {
  switch (details.kind) {
    case 'expense':
      return details.monthlyAmount;
    case 'debt':
      return details.monthlyPayment;
    case 'insurance':
      return details.monthlyPremium;
    // a recurring monthly deposit is a real checking withdrawal too, same as a bill — just money
    // moving out toward savings/investment instead of toward a payee. Pension/study fund are
    // deliberately left out: their own monthlyContribution is commonly the employee+employer
    // figure combined (see PensionDetails's own fromIncome doc-comment), often never actually
    // passing through checking at all, unlike a savings/investment transfer someone sets up
    // themselves.
    case 'savings':
    case 'investment':
      return details.monthlyContribution;
    default:
      return null;
  }
}

/** Manually-entered fallback day (see domain/entity.ts's DAY_OF_MONTH) — only the expense/debt/
 * insurance/savings/investment kinds carry a chargeDay field, so this has to read past the
 * discriminated union the same way getLinkedFieldValue does, rather than switching on `.kind`
 * again for one field. */
function manualChargeDay(details: FinancialEntity['details']): number | undefined {
  return (details as { chargeDay?: number }).chargeDay;
}

const RUNWAY_ENTITY_KINDS = new Set(['expense', 'debt', 'insurance', 'savings', 'investment']);

/** This business's own real historical day-of-month, if RiseUp has any matching transactions for
 * it — the more reliable source whenever it's available (see manualChargeDay's own doc-comment on
 * why the manual field is only ever a fallback). */
function riseupDerivedDay(businessNames: string[], transactions: MonthlyTransactions['transactions'][number][], wantIncome: boolean): number | undefined {
  const names = new Set(businessNames);
  const days = transactions.filter((t) => t.isIncome === wantIncome && names.has(t.businessName)).map((t) => dayOfMonth(t.transactionDate));
  return days.length > 0 ? medianDay(days) : undefined;
}

/**
 * Projects, from today, when the next salary lands and what's due to be charged before it —
 * "how much should be sitting in checking right now" for someone who spends last month's pay, not
 * next month's. "Charged" includes recurring savings/investment transfers, not just bills — a
 * scheduled deposit out of checking is exactly as real a withdrawal as a bill payment for this
 * purpose. Each entity's real-world day comes from its own RiseUp transaction history where
 * available (riseupDerivedDay), falling back to a manually-entered day (income's payDay,
 * expense/debt/insurance/savings/investment's chargeDay) for anyone without an active RiseUp
 * subscription, or for an obligation like alimony that never shows up as a RiseUp transaction at
 * all. Returns null when nothing at all anchors a payday date — no fabricated payday; the caller
 * (CityCashRunway) simply doesn't render anything in that case.
 */
export function computeCashRunway(
  entities: FinancialEntity[],
  monthly: MonthlyTransactions[],
  checkingTotal: number,
  today: Date = new Date(),
): CashRunway | null {
  const allTransactions = monthly.flatMap((m) => m.transactions);

  let payDay: number | undefined;
  for (const entity of entities) {
    if (entity.details.kind !== 'income') continue;
    payDay = (entity.riseupLink && riseupDerivedDay(entity.riseupLink.businessNames, allTransactions, true)) ?? entity.details.payDay;
    if (payDay !== undefined) break;
  }
  if (payDay === undefined) return null;

  const nextPaydayDate = projectNextOccurrence(today, payDay);
  const daysUntilPayday = daysBetween(today, nextPaydayDate);

  const upcomingCharges: UpcomingCharge[] = [];
  let unanchoredMonthlyTotal = 0;

  for (const entity of entities) {
    if (!RUNWAY_ENTITY_KINDS.has(entity.details.kind)) continue;
    const amount = amountFieldFor(entity.details);
    if (amount === null) continue;

    const chargeDay =
      (entity.riseupLink && riseupDerivedDay(entity.riseupLink.businessNames, allTransactions, false)) ?? manualChargeDay(entity.details);
    if (chargeDay === undefined) {
      unanchoredMonthlyTotal += amount;
      continue;
    }
    const date = projectNextOccurrence(today, chargeDay);
    if (date > nextPaydayDate) continue;
    upcomingCharges.push({ entityId: entity.id, label: entity.name, amount, date, daysFromToday: daysBetween(today, date) });
  }
  upcomingCharges.sort((a, b) => a.date.getTime() - b.date.getTime());

  const daysThisMonth = daysInMonth(today.getFullYear(), today.getMonth());
  const unanchoredShare = unanchoredMonthlyTotal * (daysUntilPayday / daysThisMonth);

  const variableAmounts = allTransactions.filter((t) => t.actualType === 'variable').map((t) => Math.abs(t.amount));
  const totalDaysSpanned = monthly.length * daysThisMonth;
  const variablePerDay = totalDaysSpanned > 0 ? variableAmounts.reduce((a, b) => a + b, 0) / totalDaysSpanned : 0;
  const variableEstimate = variablePerDay * daysUntilPayday;

  const fixedTotal = upcomingCharges.reduce((sum, c) => sum + c.amount, 0);
  const recommendedBalance = fixedTotal + unanchoredShare + variableEstimate;
  const ratio = recommendedBalance > 0 ? Math.min(1.4, checkingTotal / recommendedBalance) : 0;

  return { nextPaydayDate, daysUntilPayday, upcomingCharges, recommendedBalance, currentBalance: checkingTotal, ratio };
}
