import type { EntityCategory, ExpenseType, FinancialEntity } from './entity';
import type { RiseupTransaction } from '../app/riseupConnection';

export interface MonthlyTransactions {
  month: string;
  transactions: RiseupTransaction[];
}

export const SUGGESTION_FREQUENCIES = ['monthly', 'bimonthly', 'possiblyAnnual', 'irregular'] as const;
export type SuggestionFrequency = (typeof SUGGESTION_FREQUENCIES)[number];

export interface RiseupEntitySuggestion {
  businessName: string;
  category: EntityCategory;
  /** The average of each occurrence's own raw amount, *before* dividing by the inferred period —
   * frequency is a guess from limited data (see classifyFrequency), and the user may know better
   * than the heuristic does. Kept alongside `suggestedAmount` so the UI can recompute the latter
   * (via computeMonthlyAmount) when the user picks a different frequency than the one detected,
   * without needing to re-derive it from the original per-month transaction data. */
  rawAverageAmount: number;
  /** Always a true *monthly* figure — a suggested `monthlyAmount` for income/expense/donation, or
   * a suggested `monthlyContribution` for savings (RiseUp only sees the outgoing transfer, never
   * the account's own real balance, so that starts at 0 and the user fills it in by hand). Equal
   * to `computeMonthlyAmount(rawAverageAmount, frequency)` — a ₪1,200 charge that only hits once a
   * year suggests ₪100/month, not ₪1,200/month. */
  suggestedAmount: number;
  /** Which field on the created entity this business's real RiseUp totals get linked to (see
   * domain/entity.ts's riseupLink/LINKABLE_FIELDS) — set automatically on creation so this
   * business is never suggested again and the entity's own mismatch indicator starts working
   * immediately. */
  linkField: string;
  frequency: SuggestionFrequency;
  monthsSeen: number;
  totalMonths: number;
  expenseType?: ExpenseType;
  /** RiseUp's own fixed/variable classification (RiseupTransaction.actualType), taken as the most
   * common value across this business's own occurrences — not inferred here, since RiseUp already
   * tags every transaction with this directly. Undefined for income or the rare untagged entry;
   * the suggestions panel groups on this to separate fixed commitments from discretionary
   * spending the user can pick and choose from. */
  actualType?: 'fixed' | 'variable';
}

// how many *fetched* months apart consecutive occurrences typically sit, and how tightly clustered
// those gaps have to be to call the pattern clean rather than 'irregular'.
const MONTHLY_MAX_AVG_GAP = 1.4;
const BIMONTHLY_MAX_AVG_GAP = 2.5;
const GAP_TOLERANCE = 0.5;
// same idea, but for the *amount* itself — a business hit every month at wildly different amounts
// (e.g. plain cash withdrawals) doesn't read as "a bill" just because the interval is regular.
const AMOUNT_TOLERANCE = 0.15;
// a single occurrence in the whole fetched window is indistinguishable from a genuine one-off
// purchase UNLESS it's a large-enough amount that a real annual bill (insurance, an annual
// subscription) is actually plausible — this floor keeps a ₪20 impulse buy from getting flagged
// "אולי שנתי" just because it only happened once.
const MIN_SINGLE_OCCURRENCE_AMOUNT = 150;
// a real annual bill is a full year's cost in one shot — dividing by 12 is what turns that into
// the monthly-equivalent figure every entity's own amount field actually expects.
const FREQUENCY_DIVISOR: Record<SuggestionFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  possiblyAnnual: 12,
  irregular: 1,
};

/** Exported so the suggestions panel can recompute this when the user overrides the detected
 * frequency — the underlying raw average never changes, only which period it's assumed to cover. */
export function computeMonthlyAmount(rawAverageAmount: number, frequency: SuggestionFrequency): number {
  return Math.round(rawAverageAmount / FREQUENCY_DIVISOR[frequency]);
}

// RiseUp's own envelope category ("השקעה וחיסכון" etc.) is the primary signal; business-name
// keywords are only a fallback for when that category is missing or doesn't clearly say savings.
const SAVINGS_KEYWORDS = /חיסכון|השקעה|קופת גמל|קרן השתלמות|פנסיה/;
const HOUSING_KEYWORDS = /דיור|שכירות|ארנונה|ועד בית|משכנתא/;
const FOOD_KEYWORDS = /מזון|סופר|מסעד|קפה/;
const TRANSPORT_KEYWORDS = /תחבורה|דלק|רכב|חניה/;

function mostCommon(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function monthKeyToIndex(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + m;
}

function isAmountConsistent(amounts: number[]): boolean {
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (avg === 0) return false;
  const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg)));
  return maxDeviation / avg <= AMOUNT_TOLERANCE;
}

/** How often this business actually recurs, inferred from *which* fetched months it showed up in
 * (not just how many) — a business hitting month 1 and month 3 but never month 2 reads as
 * bimonthly, the same total count as one hitting months 1-2 straight through reads as monthly. A
 * single occurrence can't have a gap pattern at all, so it's judged solely on amount (see
 * MIN_SINGLE_OCCURRENCE_AMOUNT) as "possibly annual" rather than ruled out outright. */
function classifyFrequency(monthKeys: string[], amounts: number[]): SuggestionFrequency {
  if (monthKeys.length === 1) return 'possiblyAnnual';
  if (!isAmountConsistent(amounts)) return 'irregular';

  const indices = [...monthKeys].map(monthKeyToIndex).sort((a, b) => a - b);
  const gaps = indices.slice(1).map((idx, i) => idx - indices[i]);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));
  if (maxDeviation > GAP_TOLERANCE) return 'irregular';
  if (avgGap <= MONTHLY_MAX_AVG_GAP) return 'monthly';
  if (avgGap <= BIMONTHLY_MAX_AVG_GAP) return 'bimonthly';
  return 'irregular';
}

function classifyCategory(riseupCategory: string | undefined, businessName: string): 'savings' | 'expense' {
  const text = `${riseupCategory ?? ''} ${businessName}`;
  return SAVINGS_KEYWORDS.test(text) ? 'savings' : 'expense';
}

function inferExpenseType(riseupCategory: string | undefined, businessName: string): ExpenseType {
  const text = `${riseupCategory ?? ''} ${businessName}`;
  if (HOUSING_KEYWORDS.test(text)) return 'housing';
  if (FOOD_KEYWORDS.test(text)) return 'food';
  if (TRANSPORT_KEYWORDS.test(text)) return 'transport';
  return 'other';
}

/** Every business name already linked to some existing entity (see domain/entity.ts's
 * riseupLink) — these are already tracked, so they're never worth re-suggesting. */
function alreadyLinkedBusinessNames(entities: FinancialEntity[]): Set<string> {
  const set = new Set<string>();
  for (const e of entities) {
    if (e.riseupLink) for (const name of e.riseupLink.businessNames) set.add(name);
  }
  return set;
}

/** Recurring RiseUp business names not yet linked to any existing entity — candidates for new
 * income/expense/savings entities. Classified from RiseUp's own per-transaction category label
 * wherever available (not a from-scratch guess), falling back to business-name keywords only when
 * that's missing. Sorted monthly-first (highest confidence), then bimonthly, then possibly-annual,
 * then irregular — within each, by how many months each one showed up. */
export function buildRiseupSuggestions(monthly: MonthlyTransactions[], entities: FinancialEntity[]): RiseupEntitySuggestion[] {
  const linked = alreadyLinkedBusinessNames(entities);
  const totalMonths = monthly.length;
  const byBusiness = new Map<
    string,
    { amounts: number[]; monthKeys: string[]; isIncome: boolean; categories: string[]; actualTypes: string[] }
  >();

  for (const { month, transactions } of monthly) {
    const perBusinessThisMonth = new Map<string, { amount: number; isIncome: boolean; category?: string; actualType?: string }>();
    for (const t of transactions) {
      if (linked.has(t.businessName)) continue;
      const existing = perBusinessThisMonth.get(t.businessName);
      if (existing) existing.amount += Math.abs(t.amount);
      else perBusinessThisMonth.set(t.businessName, { amount: Math.abs(t.amount), isIncome: t.isIncome, category: t.categoryLabel, actualType: t.actualType });
    }
    for (const [name, v] of perBusinessThisMonth) {
      const entry = byBusiness.get(name) ?? { amounts: [], monthKeys: [], isIncome: v.isIncome, categories: [], actualTypes: [] };
      entry.amounts.push(v.amount);
      entry.monthKeys.push(month);
      if (v.category) entry.categories.push(v.category);
      if (v.actualType) entry.actualTypes.push(v.actualType);
      byBusiness.set(name, entry);
    }
  }

  const suggestions: RiseupEntitySuggestion[] = [];
  for (const [businessName, { amounts, monthKeys, isIncome, categories, actualTypes }] of byBusiness) {
    const frequency = classifyFrequency(monthKeys, amounts);
    const rawAvg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (frequency === 'possiblyAnnual' && rawAvg < MIN_SINGLE_OCCURRENCE_AMOUNT) continue;

    const riseupCategory = mostCommon(categories);
    const category: EntityCategory = isIncome ? 'income' : classifyCategory(riseupCategory, businessName);

    suggestions.push({
      businessName,
      category,
      rawAverageAmount: Math.round(rawAvg),
      suggestedAmount: computeMonthlyAmount(rawAvg, frequency),
      linkField: category === 'savings' ? 'monthlyContribution' : 'monthlyAmount',
      frequency,
      monthsSeen: amounts.length,
      totalMonths,
      expenseType: category === 'expense' ? inferExpenseType(riseupCategory, businessName) : undefined,
      actualType: mostCommon(actualTypes) as 'fixed' | 'variable' | undefined,
    });
  }

  const FREQUENCY_RANK: Record<SuggestionFrequency, number> = { monthly: 0, bimonthly: 1, possiblyAnnual: 2, irregular: 3 };
  return suggestions.sort((a, b) => {
    if (a.frequency !== b.frequency) return FREQUENCY_RANK[a.frequency] - FREQUENCY_RANK[b.frequency];
    return b.monthsSeen - a.monthsSeen;
  });
}
