import { z } from 'zod';

export const LIQUIDITY_LEVELS = ['immediate', 'shortTerm', 'locked'] as const;
export type Liquidity = (typeof LIQUIDITY_LEVELS)[number];

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  immediate: 'זמין מיידית',
  shortTerm: 'טווח קצר',
  locked: 'נעול',
};

const IncomeDetails = z.object({ kind: z.literal('income'), monthlyAmount: z.number().nonnegative() });
const ExpenseDetails = z.object({
  kind: z.literal('expense'),
  monthlyAmount: z.number().nonnegative(),
  essential: z.boolean().default(true),
});
// same shape as expense (a recurring monthly outflow) but tracked separately — giving isn't a
// cost to minimize the way rent or groceries are, so it shouldn't inherit expense's "risk" color
// or get grouped into the same total when judging spending.
const DonationDetails = z.object({ kind: z.literal('donation'), monthlyAmount: z.number().nonnegative() });
const SavingsDetails = z.object({
  kind: z.literal('savings'),
  balance: z.number().nonnegative(),
  isEmergencyFund: z.boolean().default(false),
});
const InvestmentDetails = z.object({
  kind: z.literal('investment'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
});
const PensionDetails = z.object({
  kind: z.literal('pension'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
});
// same shape as pension — a keren hishtalmut is employer-linked and locked the same way, but
// tracked separately since it isn't legally a pension and shouldn't be counted as one.
const StudyFundDetails = z.object({
  kind: z.literal('studyFund'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
});
export const INSURANCE_TYPES = ['life', 'health', 'mortgage', 'disability', 'other'] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];
const InsuranceDetails = z.object({
  kind: z.literal('insurance'),
  coverageAmount: z.number().nonnegative(),
  monthlyPremium: z.number().nonnegative(),
  insuranceType: z.enum(INSURANCE_TYPES),
});
const DebtDetails = z.object({
  kind: z.literal('debt'),
  outstandingBalance: z.number().nonnegative(),
  monthlyPayment: z.number().nonnegative(),
  interestRatePct: z.number().nonnegative().default(0),
});
const GoalDetails = z.object({
  kind: z.literal('goal'),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative(),
});
const RealEstateDetails = z.object({ kind: z.literal('realEstate'), currentValue: z.number().nonnegative() });
// a pure link anchor — "המעסיק שלי", "עבודה" — with no financial fields at all, so it can't distort
// any total or health calculation. Exists only to be a node that salary/pension/study-fund entities
// can link to, to represent where the money actually comes from.
const SourceDetails = z.object({ kind: z.literal('source') });

export const EntityDetailsSchema = z.discriminatedUnion('kind', [
  IncomeDetails,
  ExpenseDetails,
  DonationDetails,
  SavingsDetails,
  InvestmentDetails,
  PensionDetails,
  StudyFundDetails,
  InsuranceDetails,
  DebtDetails,
  GoalDetails,
  RealEstateDetails,
  SourceDetails,
]);
export type EntityDetails = z.infer<typeof EntityDetailsSchema>;
export type EntityCategory = EntityDetails['kind'];

export const ENTITY_CATEGORIES: readonly EntityCategory[] = [
  'source',
  'income',
  'expense',
  'donation',
  'savings',
  'investment',
  'pension',
  'studyFund',
  'insurance',
  'debt',
  'goal',
  'realEstate',
];

export const CATEGORY_LABELS: Record<EntityCategory, string> = {
  source: 'מקור',
  income: 'הכנסה',
  expense: 'הוצאה',
  donation: 'תרומה',
  savings: 'חיסכון',
  investment: 'השקעה',
  pension: 'פנסיה',
  studyFund: 'קרן השתלמות',
  insurance: 'ביטוח',
  debt: 'חוב',
  goal: 'יעד',
  realEstate: 'נדל"ן',
};

export const DISPLAY_CURRENCIES = ['ils', 'usd'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const FinancialEntitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  ownerIds: z.array(z.string()).default([]),
  // liquidity only means something for money that's actually held somewhere (savings/investment) —
  // it doesn't describe an expense or a mortgage, so it's absent rather than forced onto every entity.
  liquidity: z.enum(LIQUIDITY_LEVELS).optional(),
  linkedEntityIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  details: EntityDetailsSchema,
  // every amount is still stored in ₪ (so totals/sizing/health stay simple, single-currency math)
  // — this only remembers which currency the entity was actually entered/should be shown in, per
  // entity, not as a global "view everything in $" toggle.
  currency: z.enum(DISPLAY_CURRENCIES).default('ils'),
});
export type FinancialEntity = z.infer<typeof FinancialEntitySchema>;

export function getCategory(entity: FinancialEntity): EntityCategory {
  return entity.details.kind;
}

/**
 * Flows (income/expense) are recurring movements of money, not stored value — visually they
 * shouldn't read the same as a held asset like an investment or a piggy-bank savings pot.
 */
export function isFlowCategory(entity: FinancialEntity): boolean {
  return entity.details.kind === 'income' || entity.details.kind === 'expense' || entity.details.kind === 'donation';
}

/** Only money that's actually held somewhere has a liquidity — everything else doesn't ask.
 * Study funds (unlike pension) can actually be withdrawn — after 6 years tax-free, or earlier
 * with a tax hit — so it's a real user choice, not a fixed fact like pension's lock. */
export function isLiquidityRelevant(category: EntityCategory): boolean {
  return category === 'savings' || category === 'investment' || category === 'studyFund';
}

/** Pension is always locked by nature — no need to ask, just set it. */
export function getAutomaticLiquidity(category: EntityCategory): Liquidity | null {
  return category === 'pension' ? 'locked' : null;
}

/** The liquidity actually stored for an entity: automatic where the category dictates it, user-chosen where it's meaningful, absent otherwise. */
export function resolveLiquidity(category: EntityCategory, userSelected: Liquidity): Liquidity | undefined {
  const automatic = getAutomaticLiquidity(category);
  if (automatic) return automatic;
  return isLiquidityRelevant(category) ? userSelected : undefined;
}

export interface SecondaryDetail {
  label: string;
  amount?: number;
  text?: string;
}

/** The one extra fact — beyond the headline amount — that actually distinguishes this category. */
export function getSecondaryDetail(entity: FinancialEntity): SecondaryDetail | null {
  const d = entity.details;
  switch (d.kind) {
    case 'expense':
      return { label: d.essential ? 'הוצאה קבועה' : 'הוצאה משתנה', text: d.essential ? 'קבועה' : 'משתנה' };
    case 'savings':
      return d.isEmergencyFund ? { label: 'קרן חירום', text: 'קרן חירום' } : null;
    case 'investment':
    case 'pension':
    case 'studyFund':
      return d.monthlyContribution > 0 ? { label: 'הפקדה חודשית', amount: d.monthlyContribution } : null;
    case 'insurance':
      return { label: 'פרמיה חודשית', amount: d.monthlyPremium };
    case 'debt':
      return { label: 'תשלום חודשי', amount: d.monthlyPayment };
    case 'goal': {
      const pct = d.targetAmount > 0 ? Math.round((d.currentAmount / d.targetAmount) * 100) : 0;
      return { label: 'התקדמות', text: `${pct}%` };
    }
    case 'income':
    case 'realEstate':
    case 'source':
    case 'donation':
      return null;
  }
}

/** The single number that best represents this entity's "weight" for visual sizing. */
export function getWeight(entity: FinancialEntity): number {
  const d = entity.details;
  switch (d.kind) {
    case 'income':
    case 'expense':
    case 'donation':
      return d.monthlyAmount;
    case 'savings':
    case 'investment':
    case 'pension':
    case 'studyFund':
      return d.balance;
    case 'insurance':
      return d.coverageAmount;
    case 'debt':
      return d.outstandingBalance;
    case 'goal':
      return d.targetAmount;
    case 'realEstate':
      return d.currentValue;
    case 'source':
      return 0;
  }
}
