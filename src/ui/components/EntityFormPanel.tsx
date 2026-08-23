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
  INSURANCE_TYPES,
  INSURANCE_TYPE_LABELS,
  LIQUIDITY_LABELS,
  LIQUIDITY_LEVELS,
  isLiquidityRelevant,
  resolveLiquidity,
  type DisplayCurrency,
  type EntityCategory,
  type EntityDetails,
  type FinancialEntity,
  type Liquidity,
} from '../../domain/entity';
import { useBoardStore } from '../../app/boardStore';
import { CATEGORY_ICONS } from '../icons';
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
      return { kind: 'checking', balance: 0, availableForInvestment: 0 };
    case 'savings':
      return { kind: 'savings', balance: 0, isEmergencyFund: false };
    case 'investment':
      return { kind: 'investment', balance: 0, monthlyContribution: 0, assetType: 'traditional' };
    case 'pension':
      return { kind: 'pension', balance: 0, monthlyContribution: 0 };
    case 'studyFund':
      return { kind: 'studyFund', balance: 0, monthlyContribution: 0 };
    case 'insurance':
      return { kind: 'insurance', coverageAmount: 0, monthlyPremium: 0, insuranceType: 'life' };
    case 'debt':
      return { kind: 'debt', outstandingBalance: 0, monthlyPayment: 0, interestRatePct: 0 };
    case 'goal':
      return { kind: 'goal', targetAmount: 1, currentAmount: 0 };
    case 'realEstate':
      return { kind: 'realEstate', currentValue: 0 };
    case 'source':
      return { kind: 'source' };
  }
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
  onClose: () => void;
}

export function EntityFormPanel({ entityId, presetCategory, presetDetailOverrides, onClose }: Props) {
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
      name: '',
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

  // every amount is always stored in ₪ — these just convert what the number fields show/accept
  // to/from the entity's own chosen currency, so switching the toggle re-labels without silently
  // changing the underlying value.
  const toDisplay = (ils: number) => (draft.currency === 'usd' ? ils / usdRate : ils);
  const fromDisplay = (displayValue: number) => (draft.currency === 'usd' ? displayValue * usdRate : displayValue);
  const currencySymbol = CURRENCY_SYMBOLS[draft.currency];

  const linkableEntities = useMemo(() => entities.filter((e) => e.id !== entityId), [entities, entityId]);

  function setCategory(category: EntityCategory) {
    setDraft((d) => ({ ...d, details: defaultDetails(category) }));
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
    const payload = {
      name: draft.name.trim(),
      ownerIds: draft.ownerIds,
      liquidity: resolveLiquidity(draft.details.kind, draft.liquidity),
      linkedEntityIds: draft.linkedEntityIds,
      notes: draft.notes.trim() || undefined,
      link: draft.link.trim() || undefined,
      details: draft.details,
      currency: draft.currency,
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
    onClose();
  }

  function handleDelete() {
    if (existing) removeEntity(existing.id);
    onClose();
  }

  const d = draft.details;

  return (
    <div className={styles.overlay} onClick={onClose}>
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
          <label className={styles.field}>
            <span className={styles.label}>סכום חודשי ({currencySymbol})</span>
            <NumberField
              className={styles.input}
              value={toDisplay(d.monthlyAmount)}
              onChange={(v) => updateDetail({ monthlyAmount: fromDisplay(v) })}
            />
          </label>
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
              <span className={styles.label}>פנוי להשקעה ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.availableForInvestment)}
                onChange={(v) => updateDetail({ availableForInvestment: fromDisplay(v) })}
              />
            </label>
          </div>
        )}

        {d.kind === 'savings' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>יתרה ({currencySymbol})</span>
              <NumberField
                className={styles.input}
                value={toDisplay(d.balance)}
                onChange={(v) => updateDetail({ balance: fromDisplay(v) })}
              />
            </label>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={d.isEmergencyFund}
                onChange={(e) => updateDetail({ isEmergencyFund: e.target.checked })}
              />
              <span>זו קרן החירום המשפחתית</span>
            </div>
          </>
        )}

        {(d.kind === 'investment' || d.kind === 'pension' || d.kind === 'studyFund') && (
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
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>תשלום חודשי ({currencySymbol})</span>
                <NumberField
                  className={styles.input}
                  value={toDisplay(d.monthlyPayment)}
                  onChange={(v) => updateDetail({ monthlyPayment: fromDisplay(v) })}
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
              />
            </label>
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

        {isLiquidityRelevant(d.kind) && (
          <label className={styles.field}>
            <span className={styles.label}>נזילות</span>
            <select
              className={styles.select}
              value={draft.liquidity}
              onChange={(e) => setDraft((s) => ({ ...s, liquidity: e.target.value as Liquidity }))}
            >
              {LIQUIDITY_LEVELS.map((l) => (
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
            <button type="button" className={styles.btn} onClick={onClose}>
              ביטול
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSubmit}>
              שמירה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
