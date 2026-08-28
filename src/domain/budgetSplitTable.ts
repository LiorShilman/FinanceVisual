import type { EntityCategory, FinancialEntity } from './entity';

export type BudgetBucket = 'needs' | 'wants' | 'savings' | 'donations';

export interface BudgetSplitRow {
  id: string;
  name: string;
  bucket: BudgetBucket;
  category: EntityCategory;
  amount: number;
  /** The calendar day (1-31) this recurring amount typically charges/deposits on, straight off the
   * entity's own chargeDay/payDay field (see domain/entity.ts's DAY_OF_MONTH) — undefined for any
   * entity that never had one set, or whose kind doesn't carry the field at all (donation, pension,
   * study fund). This is the manually-entered value only, not RiseUp's own real transaction history
   * — domain/cashRunway.ts is where that richer, RiseUp-aware projection lives; this is just
   * exposing the same raw field the table's own entities already carry. */
  chargeDay?: number;
}

function chargeDayOf(details: FinancialEntity['details']): number | undefined {
  return (details as { chargeDay?: number }).chargeDay;
}

export interface BudgetBucketSummary {
  bucket: BudgetBucket;
  amount: number;
  /** Share of total income this bucket actually is — not the 50/30/20 *target*, so a household
   * over or under its own target reads as a real number here, not a number silently clamped to
   * the target it's supposed to hit. */
  ratio: number;
}

/** Every entity that composes the 50/30/20 split, one row per entity — the same underlying rule
 * domain/budgetSplit.ts's aggregate figures use, just kept at entity granularity here so a table
 * can show *what* makes up each bucket, not only how much. Savings and donations are both part of
 * the same "20%" zone (budgetSplit.ts's own `savings = savingsContribution + donations`) but kept
 * as separate buckets here so the table can show them as two distinct groups within that zone,
 * matching that file's own stated intent. */
export function buildBudgetSplitRows(entities: FinancialEntity[]): BudgetSplitRow[] {
  const rows: BudgetSplitRow[] = [];
  for (const e of entities) {
    const d = e.details;
    const chargeDay = chargeDayOf(d);
    if (d.kind === 'expense') {
      if (d.monthlyAmount > 0) rows.push({ id: e.id, name: e.name, bucket: d.essential ? 'needs' : 'wants', category: 'expense', amount: d.monthlyAmount, chargeDay });
    } else if (d.kind === 'debt') {
      if (d.monthlyPayment > 0) rows.push({ id: e.id, name: e.name, bucket: 'needs', category: 'debt', amount: d.monthlyPayment, chargeDay });
    } else if (d.kind === 'insurance') {
      if (d.monthlyPremium > 0) rows.push({ id: e.id, name: e.name, bucket: 'needs', category: 'insurance', amount: d.monthlyPremium, chargeDay });
    } else if (d.kind === 'donation') {
      if (d.monthlyAmount > 0) rows.push({ id: e.id, name: e.name, bucket: 'donations', category: 'donation', amount: d.monthlyAmount });
    } else if ((d.kind === 'savings' || d.kind === 'investment' || d.kind === 'pension' || d.kind === 'studyFund') && d.fromIncome) {
      if (d.monthlyContribution > 0) rows.push({ id: e.id, name: e.name, bucket: 'savings', category: d.kind, amount: d.monthlyContribution, chargeDay });
    }
  }
  return rows;
}

export function summarizeBudgetBuckets(rows: BudgetSplitRow[], income: number): BudgetBucketSummary[] {
  const buckets: BudgetBucket[] = ['needs', 'wants', 'savings', 'donations'];
  return buckets.map((bucket) => {
    const amount = rows.filter((r) => r.bucket === bucket).reduce((sum, r) => sum + r.amount, 0);
    return { bucket, amount, ratio: income > 0 ? amount / income : 0 };
  });
}
