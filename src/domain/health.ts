import type { EntityCategory, FinancialEntity } from './entity';

export const HEALTH_STATUSES = ['good', 'warning', 'risk', 'unknown', 'donation', 'debt', 'checking', 'insurance'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_COLORS: Record<HealthStatus, string> = {
  good: '#2f9e58',
  warning: '#e2a33d',
  risk: '#d64545',
  unknown: '#8a8f98',
  // giving isn't "money in" (income's green) or "money at risk" (expense's red) — its own rose/
  // magenta hue, deliberately unused anywhere else in the city (blue lake, violet pension ring,
  // red valley, gold flow-links), so it reads as a genuinely separate kind of thing.
  donation: '#e0508f',
  // a manageable debt still isn't "good" (income's green) or "warning" (the same orange every
  // growth asset already owns) — a distinct blue, saturated enough to still read as blue (not
  // fade into gray) once the 2D board's node dilutes it against the dark surface, that only
  // escalates to real 'risk' red once the burden actually gets dangerous.
  debt: '#4a7fc9',
  // everyday cash isn't a growth asset — it shouldn't share the same orange every actual
  // investment/savings/pension/study-fund category owns. A clean teal, distinct from every other
  // hue in the app (debt's blue leans purple, the lake is a brighter cyan-blue).
  checking: '#2fb0a0',
  // "well covered" isn't "money in" either — insurance being adequate is its own kind of good
  // news, not income's. A violet distinct from the pension water-ring's lavender (that's a
  // decorative city feature, not a health color, so no entity ever actually shows both at once).
  insurance: '#7c6fd1',
};

/**
 * For flow/stock categories, the category itself is the meaningful signal, consistently —
 * income is always "green" (money in), an expense is always "red" (money out), and every
 * held/growing asset (savings, investment, pension) is always "orange", with no per-entity
 * exceptions. Debt, insurance and goals stay on the computed score since those have a real
 * good/bad axis (leverage, coverage, progress) that a flat category color can't express.
 */
export function getDisplayHealthOverride(entity: FinancialEntity): HealthStatus | null {
  switch (entity.details.kind) {
    case 'income':
      return 'good';
    case 'expense':
      return 'risk';
    case 'donation':
      return 'donation';
    case 'checking':
      return 'checking';
    case 'savings':
    case 'investment':
    case 'pension':
    case 'studyFund':
      return 'warning';
    default:
      return null;
  }
}

export interface HealthContext {
  totalMonthlyExpenses: number;
  totalMonthlyIncome: number;
}

export function buildHealthContext(entities: FinancialEntity[]): HealthContext {
  let totalMonthlyExpenses = 0;
  let totalMonthlyIncome = 0;
  for (const e of entities) {
    if (e.details.kind === 'expense') totalMonthlyExpenses += e.details.monthlyAmount;
    if (e.details.kind === 'income') totalMonthlyIncome += e.details.monthlyAmount;
  }
  return { totalMonthlyExpenses, totalMonthlyIncome };
}

/**
 * Per-category health rules — deliberately not a single generic threshold.
 * Each category has its own notion of "healthy" grounded in how that money actually behaves.
 */
export function computeHealth(entity: FinancialEntity, ctx: HealthContext): HealthStatus {
  const d = entity.details;
  switch (d.kind) {
    case 'savings': {
      if (!d.isEmergencyFund) return 'unknown';
      if (ctx.totalMonthlyExpenses <= 0) return 'unknown';
      const monthsCovered = d.balance / ctx.totalMonthlyExpenses;
      if (monthsCovered >= 3) return 'good';
      if (monthsCovered >= 1) return 'warning';
      return 'risk';
    }
    case 'debt': {
      if (ctx.totalMonthlyIncome <= 0) return 'unknown';
      const burden = d.monthlyPayment / ctx.totalMonthlyIncome;
      const highInterest = d.interestRatePct >= 8;
      // never 'good'/green (income's color) or 'warning'/orange (every growth asset's color) even
      // at its best — a debt is a liability regardless of how manageable it is, so its own
      // baseline color applies until the burden actually escalates to real risk.
      if (burden >= 0.4 || (highInterest && burden >= 0.15)) return 'risk';
      return 'debt';
    }
    case 'insurance': {
      // never 'good'/green (income's color) — being well insured is its own kind of fine, not
      // "money in", so it gets its own color even at its best.
      if (d.insuranceType === 'life' || d.insuranceType === 'disability') {
        if (ctx.totalMonthlyIncome <= 0) return 'unknown';
        const annualIncome = ctx.totalMonthlyIncome * 12;
        const coverageYears = annualIncome > 0 ? d.coverageAmount / annualIncome : 0;
        if (coverageYears >= 5) return 'insurance';
        if (coverageYears >= 2) return 'warning';
        return 'risk';
      }
      return 'insurance';
    }
    case 'investment':
    case 'pension':
    case 'studyFund':
      return d.monthlyContribution > 0 ? 'good' : 'warning';
    case 'goal': {
      const progress = d.targetAmount > 0 ? d.currentAmount / d.targetAmount : 0;
      if (progress >= 0.75) return 'good';
      if (progress >= 0.3) return 'warning';
      return 'risk';
    }
    case 'income':
    case 'expense':
    case 'donation':
    case 'checking':
    case 'realEstate':
    case 'source':
      return 'unknown';
  }
}

export interface MissingEssential {
  key: string;
  label: string;
  category: EntityCategory;
}

/** Critical building blocks the board flags as absent — rendered as dashed "ghost" nodes. */
export function getMissingEssentials(entities: FinancialEntity[]): MissingEssential[] {
  const missing: MissingEssential[] = [];

  const hasEmergencyFund = entities.some((e) => e.details.kind === 'savings' && e.details.isEmergencyFund);
  if (!hasEmergencyFund) missing.push({ key: 'emergencyFund', label: 'קרן חירום', category: 'savings' });

  const hasLifeInsurance = entities.some((e) => e.details.kind === 'insurance' && e.details.insuranceType === 'life');
  if (!hasLifeInsurance) missing.push({ key: 'lifeInsurance', label: 'ביטוח חיים', category: 'insurance' });

  const hasPension = entities.some((e) => e.details.kind === 'pension');
  if (!hasPension) missing.push({ key: 'pension', label: 'פנסיה', category: 'pension' });

  return missing;
}
