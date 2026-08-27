import { computeBudgetSplit } from './budgetSplit';
import { computeEmergencyRunway } from './emergencyFund';
import { CATEGORY_LABELS, getCategory, getWeight, INSURANCE_TYPE_LABELS } from './entity';
import { buildHealthContext } from './health';
import { computeNetWorthBreakdown } from './netWorth';
import type { FinancialEntity } from './entity';

export interface InsightsGoalSummary {
  name: string;
  progressPct: number;
}

export interface InsightsInsuranceSummary {
  name: string;
  type: string;
  /** null when there's no income to compare coverage against, or the policy type (health/vehicle/
   * other) has no "years of income" notion in the first place — same rule as health.ts's own
   * life/disability-only coverage-ratio check. */
  coverageYears: number | null;
}

export interface InsightsDebtSummary {
  name: string;
  monthlyPayment: number;
  burdenPct: number;
}

export interface InsightsEntityLine {
  name: string;
  category: string;
  amount: number;
}

export interface InsightsSummary {
  netWorth: number;
  liquidNetWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  budgetSplit: { needsPct: number; wantsPct: number; savingsPct: number; unallocatedPct: number };
  emergencyFundMonths: number | null;
  goals: InsightsGoalSummary[];
  insurance: InsightsInsuranceSummary[];
  debts: InsightsDebtSummary[];
  /** Every entity, itemized by name/category/amount — the aggregate figures above can't answer
   * "how much is in my study fund" or "what's my biggest expense", only this can. Sent alongside
   * the aggregates (not instead of) so both the fixed automatic insights and free-form questions
   * can draw on whichever level of detail the server's own prompt actually needs (see
   * server/src/openaiClient.js — the insights prompt stays terse and aggregate-only, the
   * free-question prompt includes this list). */
  entities: InsightsEntityLine[];
  currency: 'ils';
}

/** A compact, non-transactional snapshot of the household's own state — sent to the AI-insights
 * endpoint (server/src/openaiClient.js's buildPrompt expects exactly this shape) instead of raw
 * entities, so the model only ever sees the same figures already shown elsewhere in the app, not
 * per-transaction detail it doesn't need. */
export function buildInsightsSummary(entities: FinancialEntity[]): InsightsSummary {
  const netWorth = computeNetWorthBreakdown(entities);
  const budgetSplit = computeBudgetSplit(entities);
  const emergencyRunway = computeEmergencyRunway(entities);
  const ctx = buildHealthContext(entities);

  const goals: InsightsGoalSummary[] = entities
    .filter((e): e is FinancialEntity & { details: { kind: 'goal'; targetAmount: number; currentAmount: number } } => e.details.kind === 'goal')
    .map((e) => ({
      name: e.name,
      progressPct: e.details.targetAmount > 0 ? Math.min(100, (e.details.currentAmount / e.details.targetAmount) * 100) : 0,
    }));

  const insurance: InsightsInsuranceSummary[] = entities
    .filter((e) => e.details.kind === 'insurance')
    .map((e) => {
      const d = e.details as Extract<FinancialEntity['details'], { kind: 'insurance' }>;
      const coversIncome = d.insuranceType === 'life' || d.insuranceType === 'disability';
      const annualIncome = ctx.totalMonthlyIncome * 12;
      return {
        name: e.name,
        type: INSURANCE_TYPE_LABELS[d.insuranceType],
        coverageYears: coversIncome && annualIncome > 0 ? d.coverageAmount / annualIncome : null,
      };
    });

  const debts: InsightsDebtSummary[] = entities
    .filter((e) => e.details.kind === 'debt')
    .map((e) => {
      const d = e.details as Extract<FinancialEntity['details'], { kind: 'debt' }>;
      return {
        name: e.name,
        monthlyPayment: d.monthlyPayment,
        burdenPct: ctx.totalMonthlyIncome > 0 ? (d.monthlyPayment / ctx.totalMonthlyIncome) * 100 : 0,
      };
    });

  const entityLines: InsightsEntityLine[] = entities
    .filter((e) => e.details.kind !== 'source')
    .map((e) => ({ name: e.name, category: CATEGORY_LABELS[getCategory(e)], amount: getWeight(e) }));

  return {
    netWorth: netWorth.total,
    liquidNetWorth: netWorth.liquidOnly,
    monthlyIncome: budgetSplit.income,
    monthlyExpenses: budgetSplit.needs + budgetSplit.wants,
    budgetSplit: {
      needsPct: budgetSplit.income > 0 ? (budgetSplit.needs / budgetSplit.income) * 100 : 0,
      wantsPct: budgetSplit.income > 0 ? (budgetSplit.wants / budgetSplit.income) * 100 : 0,
      savingsPct: budgetSplit.income > 0 ? (budgetSplit.savings / budgetSplit.income) * 100 : 0,
      unallocatedPct: budgetSplit.income > 0 ? (budgetSplit.unallocated / budgetSplit.income) * 100 : 0,
    },
    emergencyFundMonths: emergencyRunway.monthsOfRunway,
    goals,
    insurance,
    debts,
    entities: entityLines,
    currency: 'ils',
  };
}
