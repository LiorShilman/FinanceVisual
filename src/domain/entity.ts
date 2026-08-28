import { z } from 'zod';

export const LIQUIDITY_LEVELS = ['immediate', 'shortTerm', 'locked'] as const;
export type Liquidity = (typeof LIQUIDITY_LEVELS)[number];

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  immediate: 'זמין מיידית',
  shortTerm: 'טווח קצר',
  locked: 'נעול',
};

// 1-31, the calendar day this recurring amount typically lands/charges on — optional everywhere
// it appears (income's payDay, expense/debt/insurance's chargeDay below) because domain/cashRunway.ts
// only needs it as a *fallback*: a riseupLink with real transaction history already gives a much
// more reliable real-world day than anyone would type in by hand, so this field only matters for
// entities RiseUp doesn't (or can't) track — no active subscription, cash income, an obligation
// like alimony that never shows up as a RiseUp transaction at all. When both exist, the real
// RiseUp history wins.
const DAY_OF_MONTH = z.number().int().min(1).max(31).optional();
const IncomeDetails = z.object({ kind: z.literal('income'), monthlyAmount: z.number().nonnegative(), payDay: DAY_OF_MONTH });
export const EXPENSE_TYPES = ['housing', 'food', 'transport', 'other'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];
export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  housing: 'דיור',
  food: 'מזון',
  transport: 'תחבורה',
  other: 'אחר',
};
const ExpenseDetails = z.object({
  kind: z.literal('expense'),
  monthlyAmount: z.number().nonnegative(),
  essential: z.boolean().default(true),
  // drives which silhouette accent the city building gets — stays the same shared expense-red
  // health color regardless, only the shape varies (see CityExpenseMesh). `.catch` (not just
  // `.default`) so an entity saved under a since-removed enum value still loads as 'other'
  // instead of failing validation outright.
  expenseType: z.enum(EXPENSE_TYPES).catch('other'),
  chargeDay: DAY_OF_MONTH,
});
// same shape as expense (a recurring monthly outflow) but tracked separately — giving isn't a
// cost to minimize the way rent or groceries are, so it shouldn't inherit expense's "risk" color
// or get grouped into the same total when judging spending.
const DonationDetails = z.object({ kind: z.literal('donation'), monthlyAmount: z.number().nonnegative() });
// the everyday operating cash account — always immediately liquid by nature (like pension is
// always locked). desiredMinimumBalance is the user's own "don't touch this much" floor — what's
// actually free to move into savings/investment is balance minus that floor (see
// getCheckingAvailableForInvestment below), not a second manually-entered number that could
// silently drift out of sync with the real balance.
const CheckingDetails = z.object({
  kind: z.literal('checking'),
  balance: z.number().nonnegative(),
  desiredMinimumBalance: z.number().nonnegative().default(0),
});
const SavingsDetails = z.object({
  kind: z.literal('savings'),
  balance: z.number().nonnegative(),
  isEmergencyFund: z.boolean().default(false),
  // the growth-forecast calculator's own assumed annual return — kept on the entity (not a
  // scratch calculator input) so it's remembered per-entity across sessions, the same as any
  // other real assumption about the account. A savings account is usually near-zero real growth,
  // hence the low default; every growth kind below has the same field, just a different default.
  expectedAnnualReturnPct: z.number().min(0).max(100).default(1),
  // same shape as InvestmentDetails.monthlyContribution/fromIncome — a plain savings account can
  // get a regular monthly deposit too, and (like investment) there's no employer-match concept
  // here, so it defaults to counting toward the 20% savings figure (see domain/savingsRate.ts).
  monthlyContribution: z.number().nonnegative().default(0),
  fromIncome: z.boolean().default(true),
  chargeDay: DAY_OF_MONTH,
});
// A broad "alternative" bucket, not an enumerated list of specific instruments — crypto and
// forex are examples, not the only members, and hard-coding just those two would leave every
// other alternative asset (commodities, private equity, collectibles...) with nowhere to go.
export const ASSET_TYPES = ['traditional', 'alternative'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  traditional: 'רגיל (מניות/קרנות)',
  alternative: 'אלטרנטיבי (קריפטו, פורקס, ועוד)',
};
const InvestmentDetails = z.object({
  kind: z.literal('investment'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
  // a sub-type, not a whole new category — an alternative investment still behaves exactly like
  // any other investment (weight, liquidity, the investments table), it just gets a visibly
  // different building in the city so its volatility reads at a glance. `.catch` (not just
  // `.default`) so an entity saved under a since-removed enum value (e.g. the old 'crypto'/'forex'
  // split) still loads as 'traditional' instead of failing validation outright.
  assetType: z.enum(ASSET_TYPES).catch('traditional'),
  expectedAnnualReturnPct: z.number().min(0).max(100).default(7),
  // whether this monthlyContribution is money that actually came out of the household's own
  // tracked income (vs. e.g. a lump sum from elsewhere) — drives the 50/30/20-style "20% savings"
  // figure (see domain/savingsRate.ts). An investment contribution has no employer-match concept,
  // so it defaults to counting.
  fromIncome: z.boolean().default(true),
  chargeDay: DAY_OF_MONTH,
});
const PensionDetails = z.object({
  kind: z.literal('pension'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
  expectedAnnualReturnPct: z.number().min(0).max(100).default(5),
  // see InvestmentDetails.fromIncome. Defaults to NOT counting — a pension's own
  // monthlyContribution is typically entered as employee+employer combined (confirmed with the
  // user), and per explicit user judgment call it shouldn't count toward the 20% by default any
  // more than a keren hishtalmut's employer share does.
  fromIncome: z.boolean().default(false),
});
// same shape as pension — a keren hishtalmut is employer-linked and locked the same way, but
// tracked separately since it isn't legally a pension and shouldn't be counted as one.
const StudyFundDetails = z.object({
  kind: z.literal('studyFund'),
  balance: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative().default(0),
  expectedAnnualReturnPct: z.number().min(0).max(100).default(5),
  // see InvestmentDetails.fromIncome. Defaults to NOT counting (unlike investment/pension) — a
  // keren hishtalmut's employer share is usually the larger part of the deposit and doesn't read
  // as "money I chose to save out of my paycheck" the way an active investment or pension
  // contribution does (per explicit user judgment call, not a universal accounting rule).
  fromIncome: z.boolean().default(false),
});
export const INSURANCE_TYPES = ['life', 'health', 'mortgage', 'disability', 'vehicle', 'other'] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];
export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  life: 'ביטוח חיים',
  health: 'ביטוח בריאות',
  mortgage: 'ביטוח משכנתא',
  disability: 'אובדן כושר עבודה',
  vehicle: 'ביטוח רכב',
  other: 'אחר',
};
const InsuranceDetails = z.object({
  kind: z.literal('insurance'),
  coverageAmount: z.number().nonnegative(),
  monthlyPremium: z.number().nonnegative(),
  insuranceType: z.enum(INSURANCE_TYPES),
  // unlike an expense's own `essential` (which splits needs from wants — every insurance premium
  // still counts as a current "need" regardless of this flag, see domain/budgetSplit.ts), this
  // means "will this premium still matter once actually financially independent" — used only by
  // domain/independence.ts's computeEssentialMonthlyExpenses. Defaults true (most insurance keeps
  // running after retirement); a specific policy — e.g. life insurance meant only to bridge to
  // pension age — can be unchecked without affecting every other policy of the same type.
  essential: z.boolean().default(true),
  chargeDay: DAY_OF_MONTH,
});
// A mortgage's own track types (Israeli mortgages are near-universally split across several of
// these, each with its own rate/term) — not a separate entity category from 'debt' (see
// isMortgage below), the same way an investment's assetType or an expense's expenseType is a
// sub-type, not a whole parallel category.
export const MORTGAGE_TRACK_TYPES = ['primeLinked', 'fixedLinked', 'fixedUnlinked', 'variableLinked', 'variableUnlinked'] as const;
export type MortgageTrackType = (typeof MORTGAGE_TRACK_TYPES)[number];
export const MORTGAGE_TRACK_TYPE_LABELS: Record<MortgageTrackType, string> = {
  primeLinked: 'פריים',
  fixedLinked: 'קבועה צמודה',
  fixedUnlinked: 'קבועה לא צמודה',
  variableLinked: 'משתנה צמודה',
  variableUnlinked: 'משתנה לא צמודה',
};

const MortgageTrackSchema = z.object({
  id: z.string(),
  trackType: z.enum(MORTGAGE_TRACK_TYPES),
  outstandingBalance: z.number().nonnegative(),
  interestRatePct: z.number().nonnegative(),
  monthlyPayment: z.number().nonnegative(),
  remainingMonths: z.number().nonnegative().default(0),
});
export type MortgageTrack = z.infer<typeof MortgageTrackSchema>;

const DebtDetails = z.object({
  kind: z.literal('debt'),
  outstandingBalance: z.number().nonnegative(),
  monthlyPayment: z.number().nonnegative(),
  interestRatePct: z.number().nonnegative().default(0),
  // opt-in mortgage breakdown (the "תמהיל" — track mix). When tracks are present, the three
  // fields above are kept as their aggregate (summed balance, summed payment, balance-weighted
  // average rate) rather than a second source of truth — every other part of the app that reads
  // a debt's outstandingBalance/monthlyPayment/interestRatePct (health, city sizing, RiseUp
  // linking...) keeps working completely unchanged; the tracks are purely an editable breakdown
  // that the form aggregates on save.
  isMortgage: z.boolean().default(false),
  mortgageTracks: z.array(MortgageTrackSchema).default([]),
  // same "counts toward the financial-independence target" idea as insurance's own `essential`
  // (see domain/independence.ts's computeEssentialMonthlyExpenses) — but debt defaults to
  // *false*, the opposite of insurance's default, since most debt (a mortgage, a car loan) is
  // assumed to actually get paid off before independence, unlike most insurance. A genuinely
  // ongoing obligation that doesn't behave like typical amortizing debt — alimony/child support
  // being the clearest example — can be flagged true to count toward the target/runway like any
  // other unavoidable monthly cost.
  essential: z.boolean().default(false),
  chargeDay: DAY_OF_MONTH,
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
  CheckingDetails,
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

// the four kinds that actually accumulate over time (as opposed to a static balance like
// checking, or a liability like debt) — the only ones with a real "balance grows via
// contributions + return" story, so the only ones the growth-forecast calculator applies to.
export const GROWTH_ASSET_KINDS = ['savings', 'investment', 'pension', 'studyFund'] as const;
export type GrowthAssetKind = (typeof GROWTH_ASSET_KINDS)[number];
type GrowthAssetDetails = Extract<EntityDetails, { kind: GrowthAssetKind }>;

export function isGrowthAssetDetails(details: EntityDetails): details is GrowthAssetDetails {
  return (GROWTH_ASSET_KINDS as readonly string[]).includes(details.kind);
}

export function getGrowthMonthlyContribution(details: GrowthAssetDetails): number {
  return details.monthlyContribution;
}

// checking's own free-for-investment figure — balance above the user's own "don't touch this
// much" floor, not a second manually-entered number that could silently drift out of sync with
// the real balance (see CheckingDetails.desiredMinimumBalance).
export function getCheckingAvailableForInvestment(details: { balance: number; desiredMinimumBalance: number }): number {
  return Math.max(0, details.balance - details.desiredMinimumBalance);
}

// insurance/debt sit right after checking and before expense — the valley's red debt/expense-risk
// streams (see domain/valley.ts) source from these categories, and with them scattered at the far
// end of the row (as before), those streams had to cut clear across the whole city width to reach
// the valley. Grouping them next to checking keeps the streams local instead.
// checking sits between expense and donation, not next to income — it's a waypoint money passes
// *through* on its way out (to needs, to giving, to savings), not where it originates, so it
// reads as a hinge between the "spending" side of the city and the "saving" side, giving the two
// a visible gap in between instead of expense/checking/income all clustering on the same edge.
export const ENTITY_CATEGORIES: readonly EntityCategory[] = [
  'source',
  'income',
  'insurance',
  'debt',
  'expense',
  'checking',
  'donation',
  'savings',
  'investment',
  'pension',
  'studyFund',
  'goal',
  'realEstate',
];

export const CATEGORY_LABELS: Record<EntityCategory, string> = {
  source: 'מקור',
  income: 'הכנסה',
  expense: 'הוצאה',
  donation: 'תרומה',
  checking: 'עו״ש',
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
  // an external shortcut — the investment house's login page, the bank's site, etc. — opened in a
  // new tab straight from the edit panel. Deliberately not validated as a strict URL: a user
  // pasting a link from their bank's app or a share sheet shouldn't get rejected by an overly
  // picky format check; the open button just no-ops on genuinely empty input.
  link: z.string().optional(),
  details: EntityDetailsSchema,
  // every amount is still stored in ₪ (so totals/sizing/health stay simple, single-currency math)
  // — this only remembers which currency the entity was actually entered/should be shown in, per
  // entity, not as a global "view everything in $" toggle.
  currency: z.enum(DISPLAY_CURRENCIES).default('ils'),
  // opt-in link from one numeric field on this entity (whichever one makes sense for its kind —
  // see LINKABLE_FIELDS) to a hand-picked set of RiseUp transactions, identified by business name
  // (not transactionId — RiseUp mints a fresh id per transaction every month, but the same
  // recurring payee's name is what actually keeps matching month to month). This never overwrites
  // what was typed in by hand; it only lets the UI compute "RiseUp's total for these businesses
  // this month" alongside it and flag a mismatch — see app/riseupSync.ts.
  riseupLink: z
    .object({
      field: z.string(),
      businessNames: z.array(z.string()).min(1),
    })
    .optional(),
});
export type FinancialEntity = z.infer<typeof FinancialEntitySchema>;
export type RiseupLink = NonNullable<FinancialEntity['riseupLink']>;

/** Reads a linked field's current value straight off the live details object — deliberately not
 * typed per-kind (LINKABLE_FIELDS spans every kind's own shape), so this is the one place that
 * has to reach past the discriminated union to read it generically. */
export function getLinkedFieldValue(details: EntityDetails, field: string): number | null {
  const value = (details as unknown as Record<string, unknown>)[field];
  return typeof value === 'number' ? value : null;
}

interface LinkableField {
  key: string;
  label: string;
}

// Which numeric field(s) on each entity kind are meaningful to compare against RiseUp — a debt's
// outstandingBalance isn't something RiseUp's cashflow data can ever confirm, but its
// monthlyPayment is exactly a recurring transaction total; a goal's targetAmount is a static
// choice, but currentAmount could plausibly be tracked the same way. 'source' has no numeric
// fields at all, so it's simply absent.
export const LINKABLE_FIELDS: Partial<Record<EntityCategory, LinkableField[]>> = {
  income: [{ key: 'monthlyAmount', label: 'סכום חודשי' }],
  expense: [{ key: 'monthlyAmount', label: 'סכום חודשי' }],
  donation: [{ key: 'monthlyAmount', label: 'סכום חודשי' }],
  // desiredMinimumBalance is a personal preference, not something RiseUp's bank data could ever
  // confirm — only balance is a real, linkable bank figure.
  checking: [{ key: 'balance', label: 'יתרה' }],
  savings: [{ key: 'balance', label: 'יתרה' }],
  investment: [
    { key: 'balance', label: 'יתרה' },
    { key: 'monthlyContribution', label: 'הפקדה חודשית' },
  ],
  pension: [
    { key: 'balance', label: 'יתרה' },
    { key: 'monthlyContribution', label: 'הפקדה חודשית' },
  ],
  studyFund: [
    { key: 'balance', label: 'יתרה' },
    { key: 'monthlyContribution', label: 'הפקדה חודשית' },
  ],
  insurance: [
    { key: 'coverageAmount', label: 'סכום כיסוי' },
    { key: 'monthlyPremium', label: 'פרמיה חודשית' },
  ],
  debt: [
    { key: 'outstandingBalance', label: 'יתרת חוב' },
    { key: 'monthlyPayment', label: 'תשלום חודשי' },
  ],
  goal: [
    { key: 'targetAmount', label: 'סכום יעד' },
    { key: 'currentAmount', label: 'נצבר עד כה' },
  ],
  realEstate: [{ key: 'currentValue', label: 'שווי נוכחי' }],
};

// For each kind, which of its own LINKABLE_FIELDS entries best represents a genuine recurring
// cash movement — the kind of figure a RiseUp transaction total can actually be compared
// against, as opposed to a static balance/valuation snapshot. Used when a category switch leaves
// an existing riseupLink pointing at a field the new kind doesn't even have (see
// EntityFormPanel's handleSubmit) — retargeted here instead of just dropping the link, so the
// user's already-set-up business-name matching survives what's ultimately just a
// re-classification, not a reason to lose it.
export const PRIMARY_LINKABLE_FIELD: Partial<Record<EntityCategory, string>> = {
  income: 'monthlyAmount',
  expense: 'monthlyAmount',
  donation: 'monthlyAmount',
  checking: 'balance',
  savings: 'balance',
  investment: 'monthlyContribution',
  pension: 'monthlyContribution',
  studyFund: 'monthlyContribution',
  insurance: 'monthlyPremium',
  debt: 'monthlyPayment',
  goal: 'currentAmount',
  realEstate: 'currentValue',
};

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
 * with a tax hit — so it's a real user choice, not a fixed fact like pension's lock. An expense
 * isn't "held" anywhere either, but the same field still means something real for it: whether
 * it's a bill due right now (immediate) or one that can genuinely wait (short-term) — see
 * getAvailableLiquidityLevels below for why it doesn't get the full three-way choice. */
export function isLiquidityRelevant(category: EntityCategory): boolean {
  return category === 'savings' || category === 'investment' || category === 'studyFund' || category === 'expense';
}

/** Which liquidity choices actually make sense for a category — an expense can't be "locked" the
 * way a held asset can (there's no vault a bill sits in), so it only ever offers immediate/
 * short-term. Everything else that asks gets the full set. */
export function getAvailableLiquidityLevels(category: EntityCategory): readonly Liquidity[] {
  return category === 'expense' ? ['immediate', 'shortTerm'] : LIQUIDITY_LEVELS;
}

/** Pension is always locked and a checking account is always immediately liquid, by nature — no
 * need to ask, just set them. */
export function getAutomaticLiquidity(category: EntityCategory): Liquidity | null {
  if (category === 'pension') return 'locked';
  if (category === 'checking') return 'immediate';
  return null;
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
    case 'checking': {
      const available = getCheckingAvailableForInvestment(d);
      return available > 0 ? { label: 'פנוי להשקעה', amount: available } : null;
    }
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
    case 'checking':
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
