import { useMemo, useState } from 'react';
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  CATEGORY_LABELS,
  DISPLAY_CURRENCIES,
  ENTITY_CATEGORIES,
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABELS,
  FinancialEntitySchema,
  getAvailableLiquidityLevels,
  getLinkedFieldValue,
  INSURANCE_TYPES,
  INSURANCE_TYPE_LABELS,
  isGrowthAssetDetails,
  LINKABLE_FIELDS,
  LIQUIDITY_LABELS,
  PRIMARY_LINKABLE_FIELD,
  MORTGAGE_TRACK_TYPES,
  MORTGAGE_TRACK_TYPE_LABELS,
  isLiquidityRelevant,
  resolveLiquidity,
  type DisplayCurrency,
  type EntityCategory,
  type EntityDetails,
  type FinancialEntity,
  type Liquidity,
  type MortgageTrack,
  type MortgageTrackType,
  type RiseupLink,
} from '../../domain/entity';
import { useBoardStore } from '../../app/boardStore';
import type { RiseupTransaction } from '../../app/riseupConnection';
import { sumRiseupForBusinesses } from '../../app/riseupSync';
import { deriveRiseupDay, type MonthlyTransactions } from '../../domain/riseupSuggestions';
import { computeBudgetSplit } from '../../domain/budgetSplit';
import { CATEGORY_ICONS } from '../icons';
import { formatCurrency } from '../format';
import { MortgageScheduleModal } from './MortgageScheduleModal';
import { NumberField } from './NumberField';
import styles from './EntityFormPanel.module.css';

function defaultDetails(category: EntityCategory): EntityDetails {
  switch (category) {
    case 'income':
      return { kind: 'income', monthlyAmount: 0 };
    case 'expense':
      return { kind: 'expense', monthlyAmount: 0, essential: true, expenseType: 'other' };
    case 'donation':
      return { kind: 'donation', monthlyAmount: 0 };
    case 'checking':
      return { kind: 'checking', balance: 0, desiredMinimumBalance: 0 };
    case 'savings':
      return { kind: 'savings', balance: 0, isEmergencyFund: false, expectedAnnualReturnPct: 1, monthlyContribution: 0, fromIncome: true };
    case 'investment':
      return { kind: 'investment', balance: 0, monthlyContribution: 0, assetType: 'traditional', expectedAnnualReturnPct: 7, fromIncome: true };
    case 'pension':
      return { kind: 'pension', balance: 0, monthlyContribution: 0, expectedAnnualReturnPct: 5, fromIncome: false };
    case 'studyFund':
      return { kind: 'studyFund', balance: 0, monthlyContribution: 0, expectedAnnualReturnPct: 5, fromIncome: false };
    case 'insurance':
      return { kind: 'insurance', coverageAmount: 0, monthlyPremium: 0, insuranceType: 'life', essential: true };
    case 'debt':
      return { kind: 'debt', outstandingBalance: 0, monthlyPayment: 0, interestRatePct: 0, isMortgage: false, mortgageTracks: [], essential: false };
    case 'goal':
      return { kind: 'goal', targetAmount: 1, currentAmount: 0 };
    case 'realEstate':
      return { kind: 'realEstate', currentValue: 0 };
    case 'source':
      return { kind: 'source' };
  }
}

// Every entity kind that carries a chargeDay/payDay field at all (see domain/entity.ts's
// DAY_OF_MONTH) — donation/checking/pension/studyFund/goal/realEstate/source have no such field,
// so handleSubmit's own derived-day auto-fill below has to know not to touch them.
const DAY_FIELD_KINDS = new Set(['expense', 'debt', 'insurance', 'savings', 'investment']);

/** Shared field for income's payDay / expense·debt·insurance's chargeDay — the calendar day (1-31)
 * domain/cashRunway.ts falls back to when there's no RiseUp history to derive a real one from (see
 * that field's own doc-comment in domain/entity.ts for why it's a fallback, not the primary
 * source). Optional, so the input has to support clearing back to "unset" (empty string), not just
 * numbers — a plain NumberField (built for currency amounts, always some number) doesn't fit here.
 *
 * `derivedDay` (see the caller's own derivedDay memo) is RiseUp's own real answer for this exact
 * field, live-computed from this month's fetched history — shown as the input's displayed value
 * whenever `value` is still unset, so the field never looks empty just because nobody's typed in it
 * yet. Typing over it fires the normal onChange and turns it into a real saved override, same as
 * typing into a genuinely empty box always did. On save (see handleSubmit), an unset `value` next
 * to a real `derivedDay` gets genuinely persisted too — not just shown — so this field's own
 * "ימולא אוטומטית אם יש חיבור RISEUP" placeholder promise is literally true both on screen and in
 * what's actually saved, without ever overwriting a value someone actually typed in by hand. */
function renderDayOfMonthField(value: number | undefined, onChange: (day: number | undefined) => void, label: string, derivedDay?: number) {
  const showingDerived = value === undefined && derivedDay !== undefined;
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label} (אופציונלי)</span>
      <input
        type="number"
        min={1}
        max={31}
        className={styles.input}
        value={value ?? derivedDay ?? ''}
        placeholder="ימולא אוטומטית אם יש חיבור RISEUP"
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? undefined : Math.max(1, Math.min(31, Math.round(Number(raw)))));
        }}
      />
      {showingDerived && <p className={styles.hint}>מולא אוטומטית לפי היסטוריית RiseUp — אפשר לדרוס ידנית</p>}
    </label>
  );
}

/** The one number that best represents "how much this entity is worth/costs", across every kind's
 * own different field name for that idea — read before a category switch replaces `details`
 * wholesale with a blank default, so that figure can be carried into whichever field the new
 * category uses for the same idea instead of silently resetting to 0 (e.g. an expense's
 * monthlyAmount surviving a switch to insurance's monthlyPremium). */
function extractPrimaryAmount(details: EntityDetails): number {
  switch (details.kind) {
    case 'income':
    case 'expense':
    case 'donation':
      return details.monthlyAmount;
    case 'checking':
      return details.balance;
    case 'savings':
    case 'investment':
    case 'pension':
    case 'studyFund':
      return details.monthlyContribution || details.balance;
    case 'insurance':
      return details.monthlyPremium || details.coverageAmount;
    case 'debt':
      return details.monthlyPayment || details.outstandingBalance;
    case 'goal':
      return details.targetAmount;
    case 'realEstate':
      return details.currentValue;
    case 'source':
      return 0;
  }
}

/** The inverse of extractPrimaryAmount — writes a carried-over figure into whichever field a
 * freshly-defaulted `details` uses for that same idea. A zero amount is left alone (nothing to
 * carry, and every default already starts at 0 anyway). */
function applyPrimaryAmount(details: EntityDetails, amount: number): EntityDetails {
  if (amount <= 0) return details;
  switch (details.kind) {
    case 'income':
    case 'expense':
    case 'donation':
      return { ...details, monthlyAmount: amount };
    case 'checking':
      return { ...details, balance: amount };
    case 'savings':
    case 'investment':
    case 'pension':
    case 'studyFund':
      return { ...details, monthlyContribution: amount };
    case 'insurance':
      return { ...details, monthlyPremium: amount };
    case 'debt':
      return { ...details, monthlyPayment: amount };
    case 'goal':
      return { ...details, targetAmount: amount };
    case 'realEstate':
      return { ...details, currentValue: amount };
    case 'source':
      return details;
  }
}

function makeTrackId(): string {
  return `track-${crypto.randomUUID()}`;
}

/** The three plain debt fields (outstandingBalance/monthlyPayment/interestRatePct) as the
 * aggregate of a mortgage's tracks — balance and payment simply sum, but the rate is
 * balance-weighted (a ₪800k track at 3% and a ₪200k track at 6% is a 3.6% mortgage overall, not a
 * flat 4.5% average of the two rates). Every other part of the app keeps reading these three
 * plain fields and never needs to know tracks exist. */
function aggregateMortgageTracks(tracks: MortgageTrack[]): {
  outstandingBalance: number;
  monthlyPayment: number;
  interestRatePct: number;
} {
  const outstandingBalance = tracks.reduce((sum, t) => sum + t.outstandingBalance, 0);
  const monthlyPayment = tracks.reduce((sum, t) => sum + t.monthlyPayment, 0);
  const interestRatePct =
    outstandingBalance > 0
      ? tracks.reduce((sum, t) => sum + t.interestRatePct * t.outstandingBalance, 0) / outstandingBalance
      : 0;
  return { outstandingBalance, monthlyPayment, interestRatePct };
}

interface Draft {
  name: string;
  ownerIds: string[];
  liquidity: Liquidity;
  linkedEntityIds: string[];
  notes: string;
  link: string;
  details: EntityDetails;
  currency: DisplayCurrency;
}

const CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = { ils: '₪', usd: '$' };

interface Props {
  entityId: string | null;
  presetCategory?: EntityCategory;
  presetDetailOverrides?: Partial<EntityDetails>;
  // both only apply to a brand-new entity (entityId === null) — a name/RiseUp link the caller
  // already knows (e.g. RiseupSuggestionsPanel proposing "Netflix" as a new expense), pre-filled
  // instead of the usual blank name and no-link starting point.
  presetName?: string;
  presetRiseupLink?: RiseupLink;
  // this month's real RiseUp transactions, for the linked-field discrepancy indicator below —
  // empty when disconnected or still loading, which just hides the indicator.
  riseupTransactions: RiseupTransaction[];
  // the same multi-month history domain/cashRunway.ts uses (see useRiseupSuggestions's own
  // `monthly`) — lets the payDay/chargeDay field below show RiseUp's own real charge/pay date
  // instead of staying blank until someone types one in by hand.
  riseupMonthlyTransactions: MonthlyTransactions[];
  // opens the growth-forecast calculator (in the left-side CityControlPanel) for this saved
  // entity — absent for a not-yet-created entity, since there's nothing to project until it
  // exists.
  onOpenGrowthForecast?: (entityId: string) => void;
  // `saved` is true only when this close follows an actual successful create/update — false (or
  // omitted) for a plain cancel, the ✕/backdrop, or a delete. A caller that resolved something
  // (e.g. RiseupSuggestionsPanel) on the assumption a new entity would be created needs this
  // distinction, or cancelling out of the form still silently drops that suggestion for good.
  onClose: (saved?: boolean) => void;
}

export function EntityFormPanel({
  entityId,
  presetCategory,
  presetDetailOverrides,
  presetName,
  presetRiseupLink,
  riseupTransactions,
  riseupMonthlyTransactions,
  onOpenGrowthForecast,
  onClose,
}: Props) {
  const entities = useBoardStore((s) => s.entities);
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const addEntity = useBoardStore((s) => s.addEntity);
  const updateEntity = useBoardStore((s) => s.updateEntity);
  const removeEntity = useBoardStore((s) => s.removeEntity);
  const usdRate = useBoardStore((s) => s.usdRate);

  const existing = entityId ? entities.find((e) => e.id === entityId) ?? null : null;

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) {
      return {
        name: existing.name,
        ownerIds: existing.ownerIds,
        liquidity: existing.liquidity ?? 'immediate',
        linkedEntityIds: existing.linkedEntityIds,
        notes: existing.notes ?? '',
        link: existing.link ?? '',
        details: existing.details,
        currency: existing.currency ?? 'ils',
      };
    }
    const category = presetCategory ?? 'savings';
    return {
      name: presetName ?? '',
      ownerIds: familyMembers[0] ? [familyMembers[0].id] : [],
      liquidity: 'immediate',
      linkedEntityIds: [],
      notes: '',
      link: '',
      details: { ...defaultDetails(category), ...presetDetailOverrides } as EntityDetails,
      currency: 'ils',
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [showMortgageSchedule, setShowMortgageSchedule] = useState(false);

  // every amount is always stored in ₪ — these just convert what the number fields show/accept
  // to/from the entity's own chosen currency, so switching the toggle re-labels without silently
  // changing the underlying value.
  const toDisplay = (ils: number) => (draft.currency === 'usd' ? ils / usdRate : ils);
  const fromDisplay = (displayValue: number) => (draft.currency === 'usd' ? displayValue * usdRate : displayValue);
  const currencySymbol = CURRENCY_SYMBOLS[draft.currency];

  const linkableEntities = useMemo(() => entities.filter((e) => e.id !== entityId), [entities, entityId]);

  function setCategory(category: EntityCategory) {
    setDraft((d) => ({ ...d, details: applyPrimaryAmount(defaultDetails(category), extractPrimaryAmount(d.details)) }));
  }

  function updateDetail(patch: Record<string, unknown>) {
    setDraft((d) => ({ ...d, details: { ...d.details, ...patch } as EntityDetails }));
  }

  function toggleOwner(id: string) {
    setDraft((d) => ({
      ...d,
      ownerIds: d.ownerIds.includes(id) ? d.ownerIds.filter((o) => o !== id) : [...d.ownerIds, id],
    }));
  }

  function toggleLink(id: string) {
    setDraft((d) => ({
      ...d,
      linkedEntityIds: d.linkedEntityIds.includes(id)
        ? d.linkedEntityIds.filter((l) => l !== id)
        : [...d.linkedEntityIds, id],
    }));
  }

  function reconcileLinks(id: string, nextLinked: string[], prevLinked: string[]) {
    const added = nextLinked.filter((l) => !prevLinked.includes(l));
    const removed = prevLinked.filter((l) => !nextLinked.includes(l));
    const all = useBoardStore.getState().entities;
    for (const otherId of added) {
      const other = all.find((e) => e.id === otherId);
      if (other && !other.linkedEntityIds.includes(id)) {
        updateEntity(otherId, { linkedEntityIds: [...other.linkedEntityIds, id] });
      }
    }
    for (const otherId of removed) {
      const other = all.find((e) => e.id === otherId);
      if (other) {
        updateEntity(otherId, { linkedEntityIds: other.linkedEntityIds.filter((l) => l !== id) });
      }
    }
  }

  function handleSubmit() {
    // a category switch can leave a stale riseupLink pointing at a field that doesn't exist on
    // the new kind at all (e.g. linked to debt's monthlyPayment, then switched to realEstate,
    // which has no such field) — retargeted to that kind's own PRIMARY_LINKABLE_FIELD instead of
    // just dropping it, so the user's already-set-up business-name matching survives a mere
    // re-classification (switching an expense to insurance shouldn't silently lose its RiseUp
    // link just because the field is now called monthlyPremium instead of monthlyAmount). Only
    // actually dropped if the new kind isn't linkable at all (e.g. 'source'). Same logic applies
    // to a brand-new entity's presetRiseupLink — if the user changed the category away from what
    // the suggestion assumed, the link is retargeted the same way rather than lost.
    const validFieldKeys = new Set((LINKABLE_FIELDS[draft.details.kind] ?? []).map((f) => f.key));
    function retarget(link: RiseupLink | undefined): RiseupLink | undefined {
      if (!link) return undefined;
      if (validFieldKeys.has(link.field)) return link;
      const fallbackField = PRIMARY_LINKABLE_FIELD[draft.details.kind];
      return fallbackField ? { ...link, field: fallbackField } : undefined;
    }
    const riseupLink = existing ? retarget(existing.riseupLink) : retarget(presetRiseupLink);

    // Genuinely persist RiseUp's derived day into the entity on save, not just show it live (see
    // derivedDay's own doc-comment above) — only when the field is still empty, so a real
    // hand-typed value is never clobbered. `dayField` covers every kind that actually has one;
    // everything else (donation, checking, pension, studyFund, goal, realEstate, source) has no
    // such field to fill, so it's left alone regardless of `derivedDay`.
    const dayField = draft.details.kind === 'income' ? 'payDay' : DAY_FIELD_KINDS.has(draft.details.kind) ? 'chargeDay' : undefined;
    const currentDay = dayField ? (draft.details as Record<string, unknown>)[dayField] : undefined;
    const detailsWithDerivedDay =
      riseupLink && dayField && currentDay === undefined && derivedDay !== undefined
        ? ({ ...draft.details, [dayField]: derivedDay } as EntityDetails)
        : draft.details;

    // the checking-minimum floor (see checkingWorstCaseFloor above) only ever raises the value, on
    // save, when it's genuinely under what a real bad month could cost — never lowers a
    // deliberately higher cushion someone already set.
    const details =
      detailsWithDerivedDay.kind === 'checking' && detailsWithDerivedDay.desiredMinimumBalance < checkingWorstCaseFloor
        ? { ...detailsWithDerivedDay, desiredMinimumBalance: checkingWorstCaseFloor }
        : detailsWithDerivedDay;

    const payload = {
      name: draft.name.trim(),
      ownerIds: draft.ownerIds,
      liquidity: resolveLiquidity(draft.details.kind, draft.liquidity),
      linkedEntityIds: draft.linkedEntityIds,
      notes: draft.notes.trim() || undefined,
      link: draft.link.trim() || undefined,
      details,
      currency: draft.currency,
      riseupLink,
    };
    const result = FinancialEntitySchema.omit({ id: true }).safeParse(payload);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'שגיאה בטופס');
      return;
    }

    if (existing) {
      updateEntity(existing.id, result.data);
      reconcileLinks(existing.id, result.data.linkedEntityIds, existing.linkedEntityIds);
    } else {
      addEntity(result.data);
      const created = useBoardStore.getState().entities.at(-1) as FinancialEntity;
      reconcileLinks(created.id, result.data.linkedEntityIds, []);
    }
    onClose(true);
  }

  function handleDelete() {
    if (existing) removeEntity(existing.id);
    onClose();
  }

  function handleUnlinkRiseup() {
    if (existing) updateEntity(existing.id, { riseupLink: undefined });
  }

  // removes just one business from the link's set — dropping the last one is the same as
  // unlinking entirely, since an empty businessNames array isn't a valid link (see
  // domain/entity.ts's riseupLink schema, min(1)).
  function handleUnlinkBusiness(businessName: string) {
    if (!existing?.riseupLink) return;
    const remaining = existing.riseupLink.businessNames.filter((b) => b !== businessName);
    updateEntity(existing.id, {
      riseupLink: remaining.length > 0 ? { ...existing.riseupLink, businessNames: remaining } : undefined,
    });
  }

  // every track edit writes the whole tracks array back plus its freshly recomputed aggregate in
  // one updateDetail call — the aggregate is never allowed to drift out of sync with the tracks
  // that produced it.
  function setMortgageTracks(tracks: MortgageTrack[]) {
    updateDetail({ mortgageTracks: tracks, ...aggregateMortgageTracks(tracks) });
  }

  function addMortgageTrack() {
    if (d.kind !== 'debt') return;
    const track: MortgageTrack = {
      id: makeTrackId(),
      trackType: 'primeLinked',
      outstandingBalance: 0,
      interestRatePct: 0,
      monthlyPayment: 0,
      remainingMonths: 0,
    };
    setMortgageTracks([...d.mortgageTracks, track]);
  }

  function updateMortgageTrack(id: string, patch: Partial<MortgageTrack>) {
    if (d.kind !== 'debt') return;
    setMortgageTracks(d.mortgageTracks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeMortgageTrack(id: string) {
    if (d.kind !== 'debt') return;
    setMortgageTracks(d.mortgageTracks.filter((t) => t.id !== id));
  }

  const d = draft.details;

  // RiseUp's own real charge/pay date for this entity's linked business names, if this month's
  // history has any — feeds the day-of-month field's own live display (see renderDayOfMonthField)
  // and, on save (see handleSubmit below), actually gets written into the entity whenever the
  // field is still empty — per explicit user judgment call (2026-08-29): a RiseUp-linked entity's
  // date should end up genuinely stored, not just shown live, so every other consumer (the 50/30/20
  // table, a future export, anything that only reads the raw field) sees it too. `existing?.riseupLink
  // ?? presetRiseupLink` covers both an entity already saved with a link and a brand-new one being
  // created from a RiseupSuggestion (which only carries the link as a preset before the first save).
  // `wantIncome` follows the same rule domain/cashRunway.ts uses: only an income entity's field is
  // ever a salary deposit, everything else is an outgoing charge, no matter which numeric field it
  // links to.
  const derivedDay = useMemo(() => {
    const link = existing?.riseupLink ?? presetRiseupLink;
    if (!link) return undefined;
    const allTransactions = riseupMonthlyTransactions.flatMap((m) => m.transactions);
    return deriveRiseupDay(link.businessNames, allTransactions, d.kind === 'income');
  }, [existing, presetRiseupLink, riseupMonthlyTransactions, d.kind]);

  // A real floor for checking's own desiredMinimumBalance, not just a live-shown suggestion like
  // derivedDay above — per explicit user judgment call (2026-08-31): unlike a charge date (where
  // any real value beats a guess), a *low* minimum-balance number is actively risky, so this one
  // is worth genuinely correcting up, not just suggesting, whenever it falls under what a real bad
  // month could actually cost. A value already at or above the floor is left completely alone —
  // this only ever raises the number, never lowers a deliberately higher cushion someone set.
  //
  // "Worst case" here is needs + wants + donations — deliberately *not* budgetSplit's own
  // savingsContribution slice, despite an earlier version of this folding in the whole "savings"
  // bucket (which domain/budgetSplit.ts itself defines as savingsContribution + donations
  // combined). That was a real bug, not a judgment call: money earmarked for savings/investment is
  // money that's *supposed* to leave checking, not money that has to stay — folding it into "must
  // stay" created a circular bind an actual example caught immediately (income 20,000, needs+wants
  // 15,000, savings 3,000 → the old formula demanded 18,900+ stay in checking, consuming the very
  // 3,000 surplus the household was trying to move into savings in the first place).
  //
  // Donations don't have that same problem, so they're back in (2026-08-31 follow-up): a standing
  // donation is a real scheduled debit exactly like rent or a bill — it fires whether or not the
  // money's been manually moved anywhere first, unlike an investment/savings transfer someone
  // initiates themselves out of whatever's left over. If it isn't sitting in checking when it's
  // charged, it bounces the same way an essential expense would. needs+wants+donations is every
  // real recurring debit that genuinely has to still be sitting in checking when its own day comes
  // — not a transfer the household chooses to make. +5% is a plain safety margin, not derived from
  // anything more precise.
  const budgetSplit = useMemo(() => computeBudgetSplit(entities), [entities]);
  const CHECKING_MIN_BALANCE_SAFETY_MARGIN = 1.05;
  const checkingWorstCaseFloor = Math.round((budgetSplit.needs + budgetSplit.wants + budgetSplit.donations) * CHECKING_MIN_BALANCE_SAFETY_MARGIN);

  // read-only comparison against this month's real RiseUp data for whichever field is linked
  // (see domain/entity.ts's riseupLink) — never written back automatically; the entity's own
  // stored number only ever changes when a person types a new one in and saves.
  //
  // Deliberately compares against `existing.details` (the last *saved* value), not `d`
  // (`draft.details`, which updates on every keystroke) — comparing against the live draft made
  // this box show "0 difference" the instant you typed a matching number, before you'd actually
  // saved anything, while the city's own badge (which only ever sees the store's saved entities)
  // correctly kept showing the mismatch. Same saved value on both ends now.
  const riseupLinkInfo = useMemo(() => {
    if (!existing?.riseupLink) return null;
    const fieldMeta = (LINKABLE_FIELDS[existing.details.kind] ?? []).find((f) => f.key === existing.riseupLink!.field);
    if (!fieldMeta) return null;
    const savedValue = getLinkedFieldValue(existing.details, existing.riseupLink.field);
    if (savedValue === null) return null;
    const riseupTotal = sumRiseupForBusinesses(riseupTransactions, existing.riseupLink.businessNames);
    const draftValue = getLinkedFieldValue(d, existing.riseupLink.field);
    const hasUnsavedChange = draftValue !== null && draftValue !== savedValue;
    return { fieldMeta, savedValue, riseupTotal, businessNames: existing.riseupLink.businessNames, hasUnsavedChange };
  }, [existing, d, riseupTransactions]);

  return (
    <>
    <div className={styles.overlay} onClick={() => onClose()}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{existing ? 'עריכת ישות' : 'הוספת ישות פיננסית'}</h2>

        <div className={styles.categoryGrid}>
          {ENTITY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.categoryBtn} ${cat === d.kind ? styles.categoryBtnActive : ''}`}
              onClick={() => setCategory(cat)}
            >
              <span>{CATEGORY_ICONS[cat]}</span>
              <span>{CATEGORY_LABELS[cat]}</span>
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>שם</span>
          <input
            className={styles.input}
            value={draft.name}
            onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
            placeholder="לדוגמה: קרן חירום"
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>מטבע</span>
          <div className={styles.chipList}>
            {DISPLAY_CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.chip} ${draft.currency === c ? styles.chipActive : ''}`}
                onClick={() => setDraft((s) => ({ ...s, currency: c }))}
              >
                {CURRENCY_SYMBOLS[c]} {c === 'ils' ? 'שקל' : 'דולר'}
              </button>
            ))}
          </div>
        </div>

        {d.kind === 'income' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>סכום חודשי ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.monthlyAmount)}
                onChange={(v) => updateDetail({ monthlyAmount: fromDisplay(v) })}
              />
            </label>
            {renderDayOfMonthField(d.payDay, (payDay) => updateDetail({ payDay }), 'יום קבלת המשכורת בחודש', derivedDay)}
          </>
        )}

        {d.kind === 'expense' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>סכום חודשי ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.monthlyAmount)}
                onChange={(v) => updateDetail({ monthlyAmount: fromDisplay(v) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>סוג הוצאה</span>
              <select
                className={styles.select}
                value={d.expenseType}
                onChange={(e) => updateDetail({ expenseType: e.target.value })}
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXPENSE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={d.essential}
                onChange={(e) => updateDetail({ essential: e.target.checked })}
              />
              <span>הוצאה קבועה/הכרחית</span>
            </div>
            {renderDayOfMonthField(d.chargeDay, (chargeDay) => updateDetail({ chargeDay }), 'יום חיוב טיפוסי בחודש', derivedDay)}
          </>
        )}

        {d.kind === 'donation' && (
          <label className={styles.field}>
            <span className={styles.label}>סכום חודשי ({currencySymbol})</span>
            <NumberField
              className={styles.input}
              value={toDisplay(d.monthlyAmount)}
              onChange={(v) => updateDetail({ monthlyAmount: fromDisplay(v) })}
            />
          </label>
        )}

        {d.kind === 'checking' && (
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>יתרה ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.balance)}
                onChange={(v) => updateDetail({ balance: fromDisplay(v) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>מינימום עו״ש רצוי ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.desiredMinimumBalance)}
                onChange={(v) => updateDetail({ desiredMinimumBalance: fromDisplay(v) })}
              />
              {d.desiredMinimumBalance < checkingWorstCaseFloor && (
                <p className={styles.hint}>
                  לפי כל ההוצאות/חובות/ביטוחים/תרומות החודשיים שלך (לא כולל חיסכון/השקעה, שאמורים לצאת מהעו"ש ולא להישאר בו), + 5% מרווח
                  בטיחות — מומלץ לפחות {formatCurrency(checkingWorstCaseFloor)}. הערך יעודכן לזה אוטומטית בשמירה אם יישאר נמוך יותר.
                </p>
              )}
            </label>
          </div>
        )}

        {d.kind === 'savings' && (
          <>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>יתרה ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.balance)}
                  onChange={(v) => updateDetail({ balance: fromDisplay(v) })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>הפקדה חודשית ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.monthlyContribution)}
                  onChange={(v) => updateDetail({ monthlyContribution: fromDisplay(v) })}
                />
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <input type="checkbox" checked={d.fromIncome} onChange={(e) => updateDetail({ fromIncome: e.target.checked })} />
              <span>ההפקדה נחשבת חיסכון מההכנסה (חלק מה-20%)</span>
            </div>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={d.isEmergencyFund}
                onChange={(e) => updateDetail({ isEmergencyFund: e.target.checked })}
              />
              <span>זו קרן החירום המשפחתית</span>
            </div>
            {renderDayOfMonthField(d.chargeDay, (chargeDay) => updateDetail({ chargeDay }), 'יום הפקדה טיפוסי בחודש', derivedDay)}
          </>
        )}

        {(d.kind === 'investment' || d.kind === 'pension' || d.kind === 'studyFund') && (
          <>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>יתרה ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.balance)}
                  onChange={(v) => updateDetail({ balance: fromDisplay(v) })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>הפקדה חודשית ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.monthlyContribution)}
                  onChange={(v) => updateDetail({ monthlyContribution: fromDisplay(v) })}
                />
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <input type="checkbox" checked={d.fromIncome} onChange={(e) => updateDetail({ fromIncome: e.target.checked })} />
              <span>ההפקדה נחשבת חיסכון מההכנסה (חלק מה-20%)</span>
            </div>
            {d.kind === 'investment' &&
              renderDayOfMonthField(d.chargeDay, (chargeDay) => updateDetail({ chargeDay }), 'יום הפקדה טיפוסי בחודש', derivedDay)}
          </>
        )}

        {isGrowthAssetDetails(d) && (
          <label className={styles.field}>
            <span className={styles.label}>תשואה שנתית צפויה (%)</span>
            <input
              type="number"
              className={styles.input}
              value={d.expectedAnnualReturnPct}
              onChange={(e) => updateDetail({ expectedAnnualReturnPct: Number(e.target.value) })}
            />
          </label>
        )}

        {existing && isGrowthAssetDetails(d) && onOpenGrowthForecast && (
          <button type="button" className={styles.btn} onClick={() => onOpenGrowthForecast(existing.id)}>
            📈 תחזית צמיחה
          </button>
        )}

        {d.kind === 'investment' && (
          <label className={styles.field}>
            <span className={styles.label}>סוג נכס</span>
            <select
              className={styles.select}
              value={d.assetType}
              onChange={(e) => updateDetail({ assetType: e.target.value })}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        )}

        {d.kind === 'insurance' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>סוג ביטוח</span>
              <select
                className={styles.select}
                value={d.insuranceType}
                onChange={(e) => updateDetail({ insuranceType: e.target.value })}
              >
                {INSURANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INSURANCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>סכום כיסוי ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.coverageAmount)}
                  onChange={(v) => updateDetail({ coverageAmount: fromDisplay(v) })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>פרמיה חודשית ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.monthlyPremium)}
                  onChange={(v) => updateDetail({ monthlyPremium: fromDisplay(v) })}
                />
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <input type="checkbox" checked={d.essential} onChange={(e) => updateDetail({ essential: e.target.checked })} />
              <span>ימשיך להיות רלוונטי גם אחרי עצמאות כלכלית</span>
            </div>
            {renderDayOfMonthField(d.chargeDay, (chargeDay) => updateDetail({ chargeDay }), 'יום חיוב טיפוסי בחודש', derivedDay)}
          </>
        )}

        {d.kind === 'debt' && (
          <>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>יתרת חוב ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.outstandingBalance)}
                  onChange={(v) => updateDetail({ outstandingBalance: fromDisplay(v) })}
                  disabled={d.isMortgage && d.mortgageTracks.length > 0}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>תשלום חודשי ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.monthlyPayment)}
                  onChange={(v) => updateDetail({ monthlyPayment: fromDisplay(v) })}
                  disabled={d.isMortgage && d.mortgageTracks.length > 0}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>ריבית שנתית (%)</span>
              <input
                type="number"
                className={styles.input}
                value={d.interestRatePct}
                onChange={(e) => updateDetail({ interestRatePct: Number(e.target.value) })}
                disabled={d.isMortgage && d.mortgageTracks.length > 0}
              />
            </label>

            <div className={styles.checkboxRow}>
              <input type="checkbox" checked={d.isMortgage} onChange={(e) => updateDetail({ isMortgage: e.target.checked })} />
              <span>זו משכנתא (עם תמהיל מסלולים)</span>
            </div>
            <div className={styles.checkboxRow}>
              <input type="checkbox" checked={d.essential} onChange={(e) => updateDetail({ essential: e.target.checked })} />
              <span>ימשיך להיות רלוונטי גם אחרי עצמאות כלכלית (למשל התחייבות מתמשכת כמו מזונות, לא הלוואה שתיפרע)</span>
            </div>
            {renderDayOfMonthField(d.chargeDay, (chargeDay) => updateDetail({ chargeDay }), 'יום חיוב טיפוסי בחודש', derivedDay)}

            {d.isMortgage && (
              <div className={styles.mortgageTracks}>
                {d.mortgageTracks.length > 0 && (
                  <p className={styles.hint}>
                    יתרת החוב, התשלום החודשי והריבית למעלה מחושבים אוטומטית מסכום המסלולים כל עוד יש מסלולים.
                  </p>
                )}
                {d.mortgageTracks.map((track) => (
                  <div key={track.id} className={styles.mortgageTrackCard}>
                    <div className={styles.mortgageTrackHeader}>
                      <select
                        className={styles.select}
                        value={track.trackType}
                        onChange={(e) => updateMortgageTrack(track.id, { trackType: e.target.value as MortgageTrackType })}
                      >
                        {MORTGAGE_TRACK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {MORTGAGE_TRACK_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className={styles.removeBtn} onClick={() => removeMortgageTrack(track.id)}>
                        הסר
                      </button>
                    </div>
                    <div className={styles.mortgageTrackFields}>
                      <label className={styles.mortgageTrackField}>
                        <span className={styles.mortgageTrackFieldLabel}>יתרה ({currencySymbol})</span>
                        <NumberField
                          className={styles.input}
                          placeholder="יתרה"
                          value={toDisplay(track.outstandingBalance)}
                          onChange={(v) => updateMortgageTrack(track.id, { outstandingBalance: fromDisplay(v) })}
                        />
                      </label>
                      <label className={styles.mortgageTrackField}>
                        <span className={styles.mortgageTrackFieldLabel}>ריבית שנתית (%)</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="ריבית %"
                          value={track.interestRatePct}
                          onChange={(e) => updateMortgageTrack(track.id, { interestRatePct: Number(e.target.value) })}
                        />
                      </label>
                      <label className={styles.mortgageTrackField}>
                        <span className={styles.mortgageTrackFieldLabel}>תשלום חודשי ({currencySymbol})</span>
                        <NumberField
                          className={styles.input}
                          placeholder="תשלום חודשי"
                          value={toDisplay(track.monthlyPayment)}
                          onChange={(v) => updateMortgageTrack(track.id, { monthlyPayment: fromDisplay(v) })}
                        />
                      </label>
                      <label className={styles.mortgageTrackField}>
                        <span className={styles.mortgageTrackFieldLabel}>חודשים שנותרו</span>
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="חודשים שנותרו"
                          value={track.remainingMonths}
                          onChange={(e) => updateMortgageTrack(track.id, { remainingMonths: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <button type="button" className={styles.addBtn} onClick={addMortgageTrack}>
                  + הוספת מסלול
                </button>
                {d.mortgageTracks.length > 0 && (
                  <button type="button" className={styles.btn} onClick={() => setShowMortgageSchedule(true)}>
                    הצג לוח סילוקין (שפיצר)
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {d.kind === 'goal' && (
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>סכום יעד ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.targetAmount)}
                onChange={(v) => updateDetail({ targetAmount: fromDisplay(v) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>נצבר עד כה ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.currentAmount)}
                onChange={(v) => updateDetail({ currentAmount: fromDisplay(v) })}
              />
            </label>
          </div>
        )}

        {d.kind === 'realEstate' && (
          <label className={styles.field}>
            <span className={styles.label}>שווי נוכחי ({currencySymbol})</span>
            <NumberField
              className={styles.input}
              value={toDisplay(d.currentValue)}
              onChange={(v) => updateDetail({ currentValue: fromDisplay(v) })}
            />
          </label>
        )}

        {riseupLinkInfo && (
          <div
            className={`${styles.riseupLinkBox} ${riseupLinkInfo.savedValue !== riseupLinkInfo.riseupTotal ? styles.riseupLinkBoxMismatch : ''}`}
          >
            <span className={styles.riseupLinkTitle}>קשור ל-RiseUp — {riseupLinkInfo.fieldMeta.label}</span>
            <div className={styles.riseupLinkAmounts}>
              <span>
                בישות: <strong>{formatCurrency(riseupLinkInfo.savedValue)}</strong>
              </span>
              <span>
                ב-RiseUp החודש: <strong>{formatCurrency(riseupLinkInfo.riseupTotal)}</strong>
              </span>
              {riseupLinkInfo.savedValue !== riseupLinkInfo.riseupTotal && (
                <span className={styles.riseupLinkDiff}>
                  ⚠ הפרש {formatCurrency(Math.abs(riseupLinkInfo.riseupTotal - riseupLinkInfo.savedValue))}
                </span>
              )}
            </div>
            {riseupLinkInfo.hasUnsavedChange && (
              <span className={styles.riseupLinkDiff}>יש לך שינוי שעדיין לא נשמר בשדה הזה — לחץ "שמירה" כדי שההשוואה תתעדכן</span>
            )}
            <span className={styles.riseupLinkBusinesses}>מבוסס על:</span>
            <div className={styles.riseupBusinessChips}>
              {riseupLinkInfo.businessNames.map((b) => (
                <span key={b} className={styles.riseupBusinessChip}>
                  {b}
                  <button
                    type="button"
                    className={styles.riseupBusinessChipRemove}
                    onClick={() => handleUnlinkBusiness(b)}
                    aria-label={`בטל קישור ל-${b}`}
                    title="בטל קישור לעסק הזה בלבד"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className={styles.riseupUnlinkBtn} onClick={handleUnlinkRiseup}>
              בטל את כל הקישור
            </button>
          </div>
        )}

        {isLiquidityRelevant(d.kind) && (
          <label className={styles.field}>
            <span className={styles.label}>נזילות</span>
            <select
              className={styles.select}
              value={draft.liquidity}
              onChange={(e) => setDraft((s) => ({ ...s, liquidity: e.target.value as Liquidity }))}
            >
              {getAvailableLiquidityLevels(d.kind).map((l) => (
                <option key={l} value={l}>
                  {LIQUIDITY_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.field}>
          <span className={styles.label}>שייך ל</span>
          <div className={styles.chipList}>
            {familyMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${styles.chip} ${draft.ownerIds.includes(m.id) ? styles.chipActive : ''}`}
                onClick={() => toggleOwner(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {linkableEntities.length > 0 && (
          <div className={styles.field}>
            <span className={styles.label}>קשור לישויות</span>
            <div className={styles.chipList}>
              {linkableEntities.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`${styles.chip} ${draft.linkedEntityIds.includes(e.id) ? styles.chipActive : ''}`}
                  onClick={() => toggleLink(e.id)}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>קישור מהיר</span>
          <div className={styles.linkRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="לדוגמה: קישור להתחברות לבית ההשקעות או לחשבון הבנק"
              value={draft.link}
              onChange={(e) => setDraft((s) => ({ ...s, link: e.target.value }))}
            />
            <button
              type="button"
              className={styles.btn}
              disabled={!draft.link.trim()}
              onClick={() => {
                const url = draft.link.trim();
                if (!url) return;
                const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                window.open(href, '_blank', 'noopener,noreferrer');
              }}
            >
              פתח ↗
            </button>
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>הערות</span>
          <textarea
            className={styles.textarea}
            value={draft.notes}
            onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
          />
        </label>

        {error && <span className={styles.error}>{error}</span>}

        <div className={styles.actions}>
          <div>
            {existing && (
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDelete}>
                מחיקה
              </button>
            )}
          </div>
          <div className={styles.actionsRight}>
            <button type="button" className={styles.btn} onClick={() => onClose()}>
              ביטול
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSubmit}>
              שמירה
            </button>
          </div>
        </div>
      </div>
    </div>
    {showMortgageSchedule && d.kind === 'debt' && d.mortgageTracks.length > 0 && (
      <MortgageScheduleModal
        entityName={draft.name || 'משכנתא'}
        tracks={d.mortgageTracks}
        currency={draft.currency}
        usdRate={usdRate}
        onClose={() => setShowMortgageSchedule(false)}
      />
    )}
    </>
  );
}
