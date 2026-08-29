import type { FinancialEntity } from './entity';
import { computeBudgetSplit } from './budgetSplit';
import { computeCashRunway } from './cashRunway';
import { computeDebtPayoffPlan } from './debtPriority';
import { computeEmergencyRunway, RECOMMENDED_MIN_MONTHS } from './emergencyFund';
import type { MonthlyTransactions } from './riseupSuggestions';

export type ActionSeverity = 'critical' | 'warning' | 'tip';

/** Every action kind carries its own raw numbers, not a pre-built sentence — matching the rest of
 * the domain layer's own convention (see e.g. domain/emergencyFund.ts's gapToRecommended) of
 * staying currency-formatting-free; ActionPlanPanel.tsx is the one place that turns these into
 * actual Hebrew sentences with formatCurrency-wrapped numbers. */
export type ActionItemData =
  | { kind: 'runwayShortfall'; severity: 'critical' | 'warning'; checkingTotal: number; recommendedBalance: number; daysUntilPayday: number }
  | { kind: 'debtNeverPaysOff'; entityId: string; name: string }
  | { kind: 'debtTopPriority'; entityId: string; name: string; interestRatePct: number }
  | { kind: 'emergencyFundGap'; severity: 'critical' | 'warning'; monthsOfRunway: number; gapToRecommended: number }
  | { kind: 'overCommitted'; needs: number; wants: number; savings: number; income: number }
  | { kind: 'needsTooHigh'; needsRatio: number };

export interface ActionItem {
  id: string;
  severity: ActionSeverity;
  entityId?: string;
  data: ActionItemData;
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { critical: 0, warning: 1, tip: 2 };

// past this share of income going to "needs", the household has real trouble funding wants/savings
// at all even before hitting the harder overCommitted line (needs+wants+savings > income) — worth
// flagging on its own, one tier below overCommitted.
const NEEDS_RATIO_WARNING = 0.6;

/**
 * Synthesizes the handful of already-computed signals scattered across the app (cash runway,
 * emergency fund, 50/30/20 split, debt payoff order) into one ranked list of concrete next steps —
 * built for someone who wouldn't otherwise know which of several red/amber numbers to act on
 * first, or what "act on it" even means in plain terms. Every item here already has its own real
 * domain logic elsewhere (this never invents a new metric); this is purely a priority pass over
 * numbers that already exist, so a real problem never hides simply because it happens to live in
 * whichever panel someone opens least often. Deterministic, not AI-based — always available, no
 * API key required, and every number traces back to a specific, inspectable calculation the same
 * way the rest of the app already works.
 */
export function computeActionPlan(entities: FinancialEntity[], monthly: MonthlyTransactions[]): ActionItem[] {
  const items: ActionItem[] = [];

  const checkingTotal = entities.reduce((sum, e) => (e.details.kind === 'checking' ? sum + e.details.balance : sum), 0);
  const runway = computeCashRunway(entities, monthly, checkingTotal, new Date());
  if (runway && runway.recommendedBalance > 0) {
    if (runway.ratio < 0.5) {
      items.push({
        id: 'runway-critical',
        severity: 'critical',
        data: { kind: 'runwayShortfall', severity: 'critical', checkingTotal, recommendedBalance: runway.recommendedBalance, daysUntilPayday: runway.daysUntilPayday },
      });
    } else if (runway.ratio < 1) {
      items.push({
        id: 'runway-warning',
        severity: 'warning',
        data: { kind: 'runwayShortfall', severity: 'warning', checkingTotal, recommendedBalance: runway.recommendedBalance, daysUntilPayday: runway.daysUntilPayday },
      });
    }
  }

  const debts = computeDebtPayoffPlan(entities);
  for (const debt of debts) {
    if (debt.neverPaysOff) {
      items.push({ id: `debt-never-${debt.id}`, severity: 'critical', entityId: debt.id, data: { kind: 'debtNeverPaysOff', entityId: debt.id, name: debt.name } });
    }
  }
  // the single top-priority debt is only worth a "here's where extra money should go" tip when
  // it's actually a real choice — one debt alone has nowhere else the money could go instead, and a
  // debt that already can't cover its own interest is already flagged above with something more
  // urgent to fix first.
  if (debts.length > 1 && !debts[0].neverPaysOff) {
    items.push({
      id: `debt-priority-${debts[0].id}`,
      severity: 'tip',
      entityId: debts[0].id,
      data: { kind: 'debtTopPriority', entityId: debts[0].id, name: debts[0].name, interestRatePct: debts[0].interestRatePct },
    });
  }

  const emergency = computeEmergencyRunway(entities);
  if (emergency.monthsOfRunway !== null && emergency.gapToRecommended !== null && emergency.monthsOfRunway < RECOMMENDED_MIN_MONTHS) {
    items.push({
      id: 'emergency-gap',
      severity: emergency.monthsOfRunway < 1 ? 'critical' : 'warning',
      data: {
        kind: 'emergencyFundGap',
        severity: emergency.monthsOfRunway < 1 ? 'critical' : 'warning',
        monthsOfRunway: emergency.monthsOfRunway,
        gapToRecommended: emergency.gapToRecommended,
      },
    });
  }

  const split = computeBudgetSplit(entities);
  if (split.income > 0) {
    if (split.overCommitted) {
      items.push({ id: 'over-committed', severity: 'critical', data: { kind: 'overCommitted', needs: split.needs, wants: split.wants, savings: split.savings, income: split.income } });
    } else if (split.needs / split.income > NEEDS_RATIO_WARNING) {
      items.push({ id: 'needs-too-high', severity: 'warning', data: { kind: 'needsTooHigh', needsRatio: split.needs / split.income } });
    }
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
