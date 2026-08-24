import type { RiseupTransaction } from './riseupConnection';

/** This month's actual RiseUp spend/income, summed per business name — business name (not
 * transactionId, which is fresh every month) is what a recurring payee keeps matching across
 * months, so it's the stable key an entity's riseupLink is built on (see domain/entity.ts). */
export function computeRiseupBusinessTotals(transactions: RiseupTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    totals.set(t.businessName, (totals.get(t.businessName) ?? 0) + Math.abs(t.amount));
  }
  return totals;
}

/** This month's actual total for one entity's linked set of businesses — the number a linked
 * field's discrepancy indicator compares against what was typed in by hand. Businesses with no
 * matching transaction this month (a one-off payee, or simply nothing posted yet) just contribute
 * nothing, same as if they weren't linked at all.
 *
 * Rounded to the nearest whole ₪: every stored entity amount is already a whole number (NumberField
 * rounds as you type), but RiseUp's own transaction amounts can carry agorot, and summing several
 * of those in floating point rarely lands on an exact integer (₪3,950 shows up as
 * 3949.9999999999995) — an exact `!==` comparison against the entity's whole-number field would
 * flag a "mismatch" that isn't really one. Rounding here, once, keeps every comparison site (the
 * city badge, the entity form, the transactions-panel preview) agreeing without each needing its
 * own tolerance logic. */
export function sumRiseupForBusinesses(transactions: RiseupTransaction[], businessNames: string[]): number {
  const wanted = new Set(businessNames);
  let total = 0;
  for (const t of transactions) {
    if (wanted.has(t.businessName)) total += Math.abs(t.amount);
  }
  return Math.round(total);
}
