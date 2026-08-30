import type { FinancialEntity } from './entity';
import { amountFieldFor, daysInMonth, manualChargeDay, RUNWAY_ENTITY_KINDS } from './cashRunway';
import { deriveRiseupDay, type MonthlyTransactions } from './riseupSuggestions';

export interface CalendarEvent {
  entityId: string;
  name: string;
  amount: number;
  isIncome: boolean;
  /** 1..the target month's own real last day — a day-31 entity in a 30-day month lands on the
   * 30th, same clamping domain/cashRunway.ts's own projectNextOccurrence uses. */
  day: number;
}

/**
 * Every real, dated, non-zero money movement in `today`'s calendar month — income and every
 * domain/cashRunway.ts RUNWAY_ENTITY_KINDS outflow — laid out by day-of-month instead of rolled up
 * into a single total. Unlike computeCashRunway, this isn't bounded by "before the next payday": it
 * covers the *whole* month, past days included, because the point here is a literal, walk-through-
 * able answer to "when does money actually move" — the same real dates cashRunway/budgetSplitTable
 * already resolve (RiseUp history first, falling back to a manual payDay/chargeDay), just not
 * filtered down to only the ones still ahead. An entity with no resolved date, or a resolved amount
 * of exactly 0 (a savings/investment entity with no regular transfer set up), is left out entirely —
 * same reasoning as cashRunway's own doc-comment: nothing here should be a guess.
 */
export function computePaymentCalendar(entities: FinancialEntity[], monthly: MonthlyTransactions[], today: Date = new Date()): CalendarEvent[] {
  const allTransactions = monthly.flatMap((m) => m.transactions);
  const totalDays = daysInMonth(today.getFullYear(), today.getMonth());

  const events: CalendarEvent[] = [];

  for (const entity of entities) {
    const details = entity.details;
    if (details.kind === 'income') {
      const amount = details.monthlyAmount;
      if (amount === 0) continue;
      const rawDay = (entity.riseupLink && deriveRiseupDay(entity.riseupLink.businessNames, allTransactions, true)) ?? details.payDay;
      if (rawDay === undefined) continue;
      events.push({ entityId: entity.id, name: entity.name, amount, isIncome: true, day: Math.min(rawDay, totalDays) });
      continue;
    }

    if (!RUNWAY_ENTITY_KINDS.has(details.kind)) continue;
    const amount = amountFieldFor(details);
    if (amount === null || amount === 0) continue;

    const rawDay = (entity.riseupLink && deriveRiseupDay(entity.riseupLink.businessNames, allTransactions, false)) ?? manualChargeDay(details);
    if (rawDay === undefined) continue;

    events.push({ entityId: entity.id, name: entity.name, amount, isIncome: false, day: Math.min(rawDay, totalDays) });
  }

  return events.sort((a, b) => a.day - b.day);
}
