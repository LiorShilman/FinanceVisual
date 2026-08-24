import { fetchBudgetStatus } from './riseupConnection';

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
  const results = await Promise.all(keys.map((key) => fetchBudgetStatus(pat, key)));
  const points: MonthHistoryPoint[] = [];
  keys.forEach((month, i) => {
    const data = results[i].data;
    if (data) points.push({ month, income: data.income, expense: data.expense, net: data.net });
  });
  return points;
}
