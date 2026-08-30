import type { FinancialEntity } from './entity';
import { deriveRiseupDay, type MonthlyTransactions } from './riseupSuggestions';

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

// exported for domain/paymentCalendar.ts, which needs the same "how many days does this month
// actually have" logic to build a whole-month view, not just the next-occurrence projection below.
export function daysInMonth(year: number, monthIndex0: number): number {
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

// exported for domain/paymentCalendar.ts — same "which field actually represents this entity's
// recurring checking withdrawal" question, reused rather than re-decided per caller.
export function amountFieldFor(details: FinancialEntity['details']): number | null {
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
 * again for one field. Exported for domain/paymentCalendar.ts, same reason as amountFieldFor. */
export function manualChargeDay(details: FinancialEntity['details']): number | undefined {
  return (details as { chargeDay?: number }).chargeDay;
}

// exported for domain/paymentCalendar.ts — the whole-month calendar shows every one of these kinds
// plus income (which it handles separately, since income's own amount/day fields live directly on
// IncomeDetails rather than needing amountFieldFor/manualChargeDay at all).
export const RUNWAY_ENTITY_KINDS = new Set(['expense', 'debt', 'insurance', 'savings', 'investment']);

/**
 * Projects, from today, when the next salary lands and what's due to be charged before it —
 * "how much should be sitting in checking right now" for someone who spends last month's pay, not
 * next month's. "Charged" includes recurring savings/investment transfers, not just bills — a
 * scheduled deposit out of checking is exactly as real a withdrawal as a bill payment for this
 * purpose. Each entity's real-world day comes from its own RiseUp transaction history where
 * available (deriveRiseupDay, see domain/riseupSuggestions.ts), falling back to a manually-entered
 * day (income's payDay, expense/debt/insurance/savings/investment's chargeDay) for anyone without
 * an active RiseUp subscription, or for an obligation like alimony that never shows up as a RiseUp
 * transaction at all. Returns null when nothing at all anchors a payday date — no fabricated
 * payday; the caller (CityCashRunway) simply doesn't render anything in that case.
 *
 * Deliberately fixed-only: an entity with no resolved date at all (no RiseUp history and no manual
 * chargeDay/payDay) is simply left out, not folded in as a rough prorated/average guess — every
 * number in `recommendedBalance` should trace back to a real, named, dated obligation the caller
 * can see in `upcomingCharges`, not a silently-included estimate. Same reasoning excludes RiseUp's
 * own `variable`-tagged transaction history entirely — a historical daily-spend average is exactly
 * the kind of invisible, unauditable number this was kept away from.
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
    payDay = (entity.riseupLink && deriveRiseupDay(entity.riseupLink.businessNames, allTransactions, true)) ?? entity.details.payDay;
    if (payDay !== undefined) break;
  }
  if (payDay === undefined) return null;

  const nextPaydayDate = projectNextOccurrence(today, payDay);
  const daysUntilPayday = daysBetween(today, nextPaydayDate);

  const upcomingCharges: UpcomingCharge[] = [];

  for (const entity of entities) {
    if (!RUNWAY_ENTITY_KINDS.has(entity.details.kind)) continue;
    const amount = amountFieldFor(entity.details);
    // 0 is a real, common case for a savings/investment entity with no regular transfer set up
    // (its balance just sits there) — not a charge that's ever actually going to hit checking, so
    // it shouldn't get a beacon on the runway at all, no matter what date a stray RiseUp
    // transaction or a leftover manual chargeDay happens to resolve to (reported 2026-08-29: a
    // zero-contribution rainy-day savings entity was showing up on the 1st of the month for
    // exactly this reason).
    if (amount === null || amount === 0) continue;

    const chargeDay =
      (entity.riseupLink && deriveRiseupDay(entity.riseupLink.businessNames, allTransactions, false)) ?? manualChargeDay(entity.details);
    if (chargeDay === undefined) continue; // no known date at all — left out, not estimated
    const date = projectNextOccurrence(today, chargeDay);
    if (date > nextPaydayDate) continue;
    upcomingCharges.push({ entityId: entity.id, label: entity.name, amount, date, daysFromToday: daysBetween(today, date) });
  }
  upcomingCharges.sort((a, b) => a.date.getTime() - b.date.getTime());

  const recommendedBalance = upcomingCharges.reduce((sum, c) => sum + c.amount, 0);
  const ratio = recommendedBalance > 0 ? Math.min(1.4, checkingTotal / recommendedBalance) : 0;

  return { nextPaydayDate, daysUntilPayday, upcomingCharges, recommendedBalance, currentBalance: checkingTotal, ratio };
}
