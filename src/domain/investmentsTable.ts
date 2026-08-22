import type { FamilyMember } from './familyMember';
import { getWeight, isLiquidityRelevant, type EntityCategory, type FinancialEntity, type Liquidity } from './entity';

/** "Growing assets" — everything that accumulates value over time, as opposed to flows
 * (income/expense/donation) or one-off/contractual items (insurance, debt, goal, realEstate). */
export const INVESTMENT_TABLE_CATEGORIES: readonly EntityCategory[] = [
  'checking',
  'savings',
  'investment',
  'pension',
  'studyFund',
];

export interface DataGap {
  key: string;
  label: string;
}

/** Every entity here funds its own future — a gap in its data (no owner, no liquidity, an
 * account nobody's contributing to) is a real planning blind spot, not cosmetic, which is the
 * whole point of this table. */
function computeGaps(entity: FinancialEntity): DataGap[] {
  const gaps: DataGap[] = [];
  const d = entity.details;
  if (entity.ownerIds.length === 0) gaps.push({ key: 'owner', label: 'ללא שיוך לבן משפחה' });
  if (isLiquidityRelevant(d.kind) && !entity.liquidity) gaps.push({ key: 'liquidity', label: 'נזילות לא הוגדרה' });
  if (getWeight(entity) === 0) gaps.push({ key: 'balance', label: 'יתרה אפס' });
  if ((d.kind === 'investment' || d.kind === 'pension' || d.kind === 'studyFund') && d.monthlyContribution === 0) {
    gaps.push({ key: 'contribution', label: 'אין הפקדה חודשית' });
  }
  if (entity.linkedEntityIds.length === 0) gaps.push({ key: 'link', label: 'לא מקושר למקור הכנסה' });
  return gaps;
}

export interface InvestmentTableRow {
  id: string;
  name: string;
  category: EntityCategory;
  ownerNames: string[];
  balance: number;
  /** null when the category's schema doesn't even track a monthly contribution (savings). */
  monthlyContribution: number | null;
  liquidity: Liquidity | undefined;
  liquidityLabel: string;
  currency: FinancialEntity['currency'];
  linkedCount: number;
  gaps: DataGap[];
}

const LIQUIDITY_ROW_LABELS: Record<Liquidity, string> = {
  immediate: 'זמין מיידית',
  shortTerm: 'טווח קצר',
  locked: 'נעול',
};

function liquidityLabelFor(entity: FinancialEntity): string {
  if (entity.liquidity) return LIQUIDITY_ROW_LABELS[entity.liquidity];
  if (entity.details.kind === 'pension') return 'נעול (אוטומטי)';
  return '—';
}

export function buildInvestmentTableRows(
  entities: FinancialEntity[],
  familyMembers: FamilyMember[],
): InvestmentTableRow[] {
  const memberName = new Map(familyMembers.map((m) => [m.id, m.name]));
  return entities
    .filter((e) => INVESTMENT_TABLE_CATEGORIES.includes(e.details.kind))
    .map((e) => {
      const d = e.details;
      const monthlyContribution =
        d.kind === 'investment' || d.kind === 'pension' || d.kind === 'studyFund' ? d.monthlyContribution : null;
      return {
        id: e.id,
        name: e.name,
        category: d.kind,
        ownerNames: e.ownerIds.map((id) => memberName.get(id) ?? '—'),
        balance: getWeight(e),
        monthlyContribution,
        liquidity: e.liquidity,
        liquidityLabel: liquidityLabelFor(e),
        currency: e.currency,
        linkedCount: e.linkedEntityIds.length,
        gaps: computeGaps(e),
      };
    })
    .sort((a, b) => {
      if (a.category !== b.category) return INVESTMENT_TABLE_CATEGORIES.indexOf(a.category) - INVESTMENT_TABLE_CATEGORIES.indexOf(b.category);
      return b.balance - a.balance;
    });
}

export interface InvestmentTableSummary {
  category: EntityCategory;
  count: number;
  totalBalance: number;
  totalMonthlyContribution: number;
  gapCount: number;
}

export function summarizeInvestmentTable(rows: InvestmentTableRow[]): InvestmentTableSummary[] {
  const byCategory = new Map<EntityCategory, InvestmentTableSummary>();
  for (const row of rows) {
    const existing = byCategory.get(row.category);
    const entry = existing ?? { category: row.category, count: 0, totalBalance: 0, totalMonthlyContribution: 0, gapCount: 0 };
    entry.count += 1;
    entry.totalBalance += row.balance;
    entry.totalMonthlyContribution += row.monthlyContribution ?? 0;
    entry.gapCount += row.gaps.length;
    byCategory.set(row.category, entry);
  }
  return INVESTMENT_TABLE_CATEGORIES.map((c) => byCategory.get(c)).filter((s): s is InvestmentTableSummary => !!s);
}

export interface InvestmentTableGrandTotal {
  count: number;
  totalBalance: number;
  totalMonthlyContribution: number;
  gapCount: number;
}

export function computeGrandTotal(rows: InvestmentTableRow[]): InvestmentTableGrandTotal {
  return rows.reduce<InvestmentTableGrandTotal>(
    (acc, row) => ({
      count: acc.count + 1,
      totalBalance: acc.totalBalance + row.balance,
      totalMonthlyContribution: acc.totalMonthlyContribution + (row.monthlyContribution ?? 0),
      gapCount: acc.gapCount + row.gaps.length,
    }),
    { count: 0, totalBalance: 0, totalMonthlyContribution: 0, gapCount: 0 },
  );
}
