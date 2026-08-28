import { fetchBudgetStatus, fetchTransactions } from './riseupConnection';
import type { MonthlyTransactions } from '../domain/riseupSuggestions';

export interface MonthHistoryPoint {
  /** 'YYYY-MM', oldest first. */
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** Explicit 'YYYY-MM' strings, not RiseUp's own 'current'/'previous' shorthands — fetching N
 * months back needs one deterministic key per month regardless of how far back it goes, and the
 * label shown under each bar has to match exactly what was fetched. */
function monthKey(monthsBack: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Last `months` months of real RiseUp totals, oldest to newest — a month RiseUp has no data for
 * (never connected yet, or genuinely nothing happened) is simply left out rather than shown as a
 * zero bar, which would misleadingly read as "spent nothing" instead of "no data".
 *
 * RiseUp's own external API also has a combined GET /api/external/budget/:date/:numMonthsBack
 * (already proxied here as /api/budget/:date/:months, see RiseUp/server) that would do this in
 * one request instead of `months` parallel ones — but its public docs don't specify whether the
 * envelopes it returns carry per-month attribution or come back flattened across the whole span,
 * and getting that wrong would silently misattribute amounts to the wrong month. This sticks with
 * `months` calls to the single-month endpoint, whose response shape (envelopes with `actuals`)
 * is the same one computeActualsTotals already parses correctly for "current month" everywhere
 * else in the app. */
export async function fetchRiseupHistory(pat: string, months: number): Promise<MonthHistoryPoint[]> {
  const keys = Array.from({ length: months }, (_, i) => monthKey(months - 1 - i));
  // sequential, not Promise.all — firing all `months` requests at once tripped RiseUp's own rate
  // limit (429s), which then made even the separate "current month" connection check fail too,
  // reading as "not connected" despite a perfectly valid PAT. One at a time is slower but doesn't
  // starve the rest of the app's own RiseUp calls.
  const points: MonthHistoryPoint[] = [];
  for (const month of keys) {
    const result = await fetchBudgetStatus(pat, month);
    if (result.data) points.push({ month, income: result.data.income, expense: result.data.expense, net: result.data.net });
  }
  return points;
}

/** Last `months` months of real RiseUp transactions, oldest to newest — feeds
 * domain/riseupSuggestions.ts's recurring-business detection. Sequential, same reasoning as
 * fetchRiseupHistory above (parallel requests trip RiseUp's own rate limit). A month with no
 * transactions returned (network hiccup, nothing posted) just contributes an empty array rather
 * than being skipped — the suggestion logic needs to know how many months were actually checked,
 * not just how many had data, to judge how "regular" a business really is. */
export async function fetchRiseupTransactionHistory(pat: string, months: number): Promise<MonthlyTransactions[]> {
  const keys = Array.from({ length: months }, (_, i) => monthKey(months - 1 - i));
  const result: MonthlyTransactions[] = [];
  for (const month of keys) {
    const transactions = await fetchTransactions(pat, month);
    result.push({ month, transactions: transactions ?? [] });
  }
  return result;
}
