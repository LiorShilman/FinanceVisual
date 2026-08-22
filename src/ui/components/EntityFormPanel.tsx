import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  ENTITY_CATEGORIES,
  FinancialEntitySchema,
  INSURANCE_TYPES,
  LIQUIDITY_LABELS,
  LIQUIDITY_LEVELS,
  isLiquidityRelevant,
  resolveLiquidity,
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
      return { kind: 'expense', monthlyAmount: 0, essential: true };
    case 'savings':
      return { kind: 'savings', balance: 0, isEmergencyFund: false };
    case 'investment':
      return { kind: 'investment', balance: 0, monthlyContribution: 0 };
    case 'pension':
      return { kind: 'pension', balance: 0, monthlyContribution: 0 };
    case 'insurance':
      return { kind: 'insurance', coverageAmount: 0, monthlyPremium: 0, insuranceType: 'life' };
    case 'debt':
      return { kind: 'debt', outstandingBalance: 0, monthlyPayment: 0, interestRatePct: 0 };
    case 'goal':
      return { kind: 'goal', targetAmount: 1, currentAmount: 0 };
    case 'realEstate':
      return { kind: 'realEstate', currentValue: 0 };
  }
}

interface Draft {
  name: string;
  ownerIds: string[];
  liquidity: Liquidity;
  linkedEntityIds: string[];
  notes: string;
  details: EntityDetails;
}

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

  const existing = entityId ? entities.find((e) => e.id === entityId) ?? null : null;

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) {
      return {
        name: existing.name,
        ownerIds: existing.ownerIds,
        liquidity: existing.liquidity ?? 'immediate',
        linkedEntityIds: existing.linkedEntityIds,
        notes: existing.notes ?? '',
        details: existing.details,
      };
    }
    const category = presetCategory ?? 'savings';
    return {
      name: '',
      ownerIds: familyMembers[0] ? [familyMembers[0].id] : [],
      liquidity: 'immediate',
      linkedEntityIds: [],
      notes: '',
      details: { ...defaultDetails(category), ...presetDetailOverrides } as EntityDetails,
    };
  });
  const [error, setError] = useState<string | null>(null);

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
      details: draft.details,
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

        {d.kind === 'income' && (
          <label className={styles.field}>
            <span className={styles.label}>סכום חודשי (₪)</span>
            <NumberField
              className={styles.input}
              value={d.monthlyAmount}
              onChange={(v) => updateDetail({ monthlyAmount: v })}
            />
          </label>
        )}

        {d.kind === 'expense' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>סכום חודשי (₪)</span>
              <NumberField
                className={styles.input}
                value={d.monthlyAmount}
                onChange={(v) => updateDetail({ monthlyAmount: v })}
              />
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

        {d.kind === 'savings' && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>יתרה (₪)</span>
              <NumberField className={styles.input} value={d.balance} onChange={(v) => updateDetail({ balance: v })} />
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

        {(d.kind === 'investment' || d.kind === 'pension') && (
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>יתרה (₪)</span>
              <NumberField className={styles.input} value={d.balance} onChange={(v) => updateDetail({ balance: v })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>הפקדה חודשית (₪)</span>
              <NumberField
                className={styles.input}
                value={d.monthlyContribution}
                onChange={(v) => updateDetail({ monthlyContribution: v })}
              />
            </label>
          </div>
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
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>סכום כיסוי (₪)</span>
                <NumberField
                  className={styles.input}
                  value={d.coverageAmount}
                  onChange={(v) => updateDetail({ coverageAmount: v })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>פרמיה חודשית (₪)</span>
                <NumberField
                  className={styles.input}
                  value={d.monthlyPremium}
                  onChange={(v) => updateDetail({ monthlyPremium: v })}
                />
              </label>
            </div>
          </>
        )}

        {d.kind === 'debt' && (
          <>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>יתרת חוב (₪)</span>
                <NumberField
                  className={styles.input}
                  value={d.outstandingBalance}
                  onChange={(v) => updateDetail({ outstandingBalance: v })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>תשלום חודשי (₪)</span>
                <NumberField
                  className={styles.input}
                  value={d.monthlyPayment}
                  onChange={(v) => updateDetail({ monthlyPayment: v })}
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
              <span className={styles.label}>סכום יעד (₪)</span>
              <NumberField
                className={styles.input}
                value={d.targetAmount}
                onChange={(v) => updateDetail({ targetAmount: v })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>נצבר עד כה (₪)</span>
              <NumberField
                className={styles.input}
                value={d.currentAmount}
                onChange={(v) => updateDetail({ currentAmount: v })}
              />
            </label>
          </div>
        )}

        {d.kind === 'realEstate' && (
          <label className={styles.field}>
            <span className={styles.label}>שווי נוכחי (₪)</span>
            <NumberField
              className={styles.input}
              value={d.currentValue}
              onChange={(v) => updateDetail({ currentValue: v })}
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
