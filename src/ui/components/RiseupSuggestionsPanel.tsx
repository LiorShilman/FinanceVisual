import { useMemo, useState } from 'react';
import { useBoardStore } from '../../app/boardStore';
import type { RiseupSuggestionsLoadState } from '../../app/useRiseupSuggestions';
import { computeMonthlyAmount, SUGGESTION_FREQUENCIES, type RiseupEntitySuggestion, type SuggestionFrequency } from '../../domain/riseupSuggestions';
import { CATEGORY_LABELS, EXPENSE_TYPE_LABELS, LINKABLE_FIELDS, type FinancialEntity } from '../../domain/entity';
import { formatCurrency } from '../format';
import styles from './RiseupSuggestionsPanel.module.css';

interface Props {
  loadState: RiseupSuggestionsLoadState;
  suggestions: RiseupEntitySuggestion[];
  hasPat: boolean;
  onClose: () => void;
  onAddSuggestion: (suggestion: RiseupEntitySuggestion) => void;
  onLinkExisting: (businessName: string, entityId: string, field: string) => void;
  /** The "add several variable-expense suggestions as one combined entity" flow — see this
   * panel's own variable section below. */
  onAddCombinedVariableExpense: (suggestions: RiseupEntitySuggestion[]) => void;
}

const FREQUENCY_LABEL: Record<RiseupEntitySuggestion['frequency'], string> = {
  monthly: 'חודשי',
  bimonthly: 'דו-חודשי',
  possiblyAnnual: 'אולי שנתי',
  irregular: 'לא סדיר',
};
const FREQUENCY_STYLE: Record<RiseupEntitySuggestion['frequency'], string> = {
  monthly: 'regularityFixed',
  bimonthly: 'regularityFixed',
  possiblyAnnual: 'regularityWarning',
  irregular: 'regularityVariable',
};

interface CardProps {
  suggestion: RiseupEntitySuggestion;
  linkableEntities: FinancialEntity[];
  onAdd: (suggestion: RiseupEntitySuggestion) => void;
  onLinkExisting: (businessName: string, entityId: string, field: string) => void;
  /** Present only for cards in the variable section — the checkbox that feeds the "combine into
   * one entity" flow below. Fixed-section cards render without one. */
  selection?: { checked: boolean; onToggle: () => void };
}

/** One suggestion, with two ways to resolve it: create it as a brand-new entity (the common case),
 * or — since the same real-world bill can show up under a different name than what was typed in by
 * hand (RiseUp's "עיריית תל אביב" vs. an entity the user already named "ארנונה") — link it onto an
 * existing entity instead, so a genuine duplicate doesn't get created. The detected frequency
 * (monthly/bimonthly/possibly-annual) is only ever a best guess from a few months of data — the
 * dropdown lets the user override it, which live-recomputes the suggested monthly amount to match
 * (see domain/riseupSuggestions.ts's computeMonthlyAmount). */
function SuggestionCard({ suggestion: s, linkableEntities, onAdd, onLinkExisting, selection }: CardProps) {
  const [frequency, setFrequency] = useState<SuggestionFrequency>(s.frequency);
  const suggestedAmount = computeMonthlyAmount(s.rawAverageAmount, frequency);

  const [linkEntityId, setLinkEntityId] = useState('');
  const linkEntity = linkableEntities.find((e) => e.id === linkEntityId) ?? null;
  const linkFieldOptions = linkEntity ? (LINKABLE_FIELDS[linkEntity.details.kind] ?? []) : [];
  const [linkField, setLinkField] = useState('');

  return (
    <div className={styles.card}>
      <div className={styles.cardTopRow}>
        {selection && (
          <input
            type="checkbox"
            className={styles.cardCheckbox}
            checked={selection.checked}
            onChange={selection.onToggle}
            aria-label={`בחר ${s.businessName} להוצאה משתנה מאוחדת`}
          />
        )}
        <div className={styles.cardMain}>
          <span className={styles.cardName}>{s.businessName}</span>
          <span className={styles.cardMeta}>
            {CATEGORY_LABELS[s.category]}
            {s.expenseType && s.expenseType !== 'other' ? ` · ${EXPENSE_TYPE_LABELS[s.expenseType]}` : ''}
            {' · '}
            {s.monthsSeen} מתוך {s.totalMonths} חודשים
          </span>
        </div>
        <select
          className={`${styles.frequencySelect} ${styles[FREQUENCY_STYLE[frequency]]}`}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as SuggestionFrequency)}
        >
          {SUGGESTION_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
        <span className={styles.cardAmount}>{formatCurrency(suggestedAmount)}</span>
        <button type="button" className={styles.addBtn} onClick={() => onAdd({ ...s, frequency, suggestedAmount })}>
          + הוסף כישות
        </button>
      </div>
      <div className={styles.linkRow}>
        <span className={styles.linkRowLabel}>או קשר לישות קיימת:</span>
        <select
          className={styles.linkSelect}
          value={linkEntityId}
          onChange={(e) => {
            setLinkEntityId(e.target.value);
            setLinkField('');
          }}
        >
          <option value="">בחר ישות…</option>
          {linkableEntities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {linkEntity && (
          <select className={styles.linkSelect} value={linkField} onChange={(e) => setLinkField(e.target.value)}>
            <option value="">לאיזה שדה…</option>
            {linkFieldOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={styles.linkBtn}
          disabled={!linkEntity || !linkField}
          onClick={() => linkEntity && linkField && onLinkExisting(s.businessName, linkEntity.id, linkField)}
        >
          קשר
        </button>
      </div>
    </div>
  );
}

/**
 * Presents the last few months of real RiseUp transactions, already scanned for recurring
 * businesses that aren't tracked as an entity yet (see app/useRiseupSuggestions.ts, which owns the
 * actual fetch — lifted above this panel so closing and reopening it doesn't re-run the whole
 * multi-month scan) — a subscription, a recurring transfer to savings, a salary. Turn any of them
 * into a real entity with one click, pre-filled and pre-linked so it's never suggested again, or
 * link it onto an entity that already exists but just isn't linked to this business name yet.
 *
 * Split into fixed/variable sections using RiseUp's own actualType classification (not inferred —
 * RiseUp already tags every transaction with this) — the variable section additionally lets the
 * user check off several businesses and fold them into one combined "variable expenses" entity,
 * since tracking each discretionary purchase as its own entity is far more granular than most
 * people want, and a single combined figure is what the budget split (see domain/budgetSplit.ts)
 * actually needs to count toward the 30% "wants" bucket.
 */
export function RiseupSuggestionsPanel({
  loadState,
  suggestions,
  hasPat,
  onClose,
  onAddSuggestion,
  onLinkExisting,
  onAddCombinedVariableExpense,
}: Props) {
  const entities = useBoardStore((s) => s.entities);
  const [selectedVariable, setSelectedVariable] = useState<Set<string>>(new Set());

  // only entities whose kind actually has a numeric field worth linking to (a 'source' node has
  // none) — same filter RiseupTransactionsPanel's own linking UI uses. Sorted alphabetically so a
  // family with many entities can actually scan the dropdown instead of hunting through creation
  // order.
  const linkableEntities = entities
    .filter((e) => (LINKABLE_FIELDS[e.details.kind]?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const fixedSuggestions = suggestions.filter((s) => s.actualType === 'fixed');
  const variableSuggestions = suggestions.filter((s) => s.actualType === 'variable');
  const unclassifiedSuggestions = suggestions.filter((s) => s.actualType == null);

  const selectedSuggestions = useMemo(
    () => variableSuggestions.filter((s) => selectedVariable.has(s.businessName)),
    [variableSuggestions, selectedVariable],
  );
  const selectedTotal = selectedSuggestions.reduce((sum, s) => sum + s.suggestedAmount, 0);

  function toggleVariable(businessName: string) {
    setSelectedVariable((prev) => {
      const next = new Set(prev);
      if (next.has(businessName)) next.delete(businessName);
      else next.add(businessName);
      return next;
    });
  }

  function handleAddCombined() {
    if (selectedSuggestions.length === 0) return;
    onAddCombinedVariableExpense(selectedSuggestions);
    setSelectedVariable(new Set());
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>הצעות מ-RiseUp</h2>
            <span className={styles.subtitle}>עסקים חוזרים מהחודשים האחרונים שעדיין לא נמצאים כישות</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {loadState === 'loading' && <div className={styles.state}>סורק תנועות מ-RiseUp…</div>}
        {loadState === 'error' && (
          <div className={`${styles.state} ${styles.stateError}`}>
            {hasPat ? 'שגיאה בטעינת נתונים מ-RiseUp' : 'יש לחבר קודם חשבון RiseUp (בפאנל המשפחה)'}
          </div>
        )}
        {loadState === 'ready' && suggestions.length === 0 && (
          <div className={styles.state}>לא נמצאו עסקים חוזרים שעדיין לא במעקב 🎉</div>
        )}

        {loadState === 'ready' && suggestions.length > 0 && (
          <div className={styles.list}>
            {fixedSuggestions.length > 0 && (
              <>
                <div className={styles.sectionHeader}>קבועות</div>
                {fixedSuggestions.map((s) => (
                  <SuggestionCard key={s.businessName} suggestion={s} linkableEntities={linkableEntities} onAdd={onAddSuggestion} onLinkExisting={onLinkExisting} />
                ))}
              </>
            )}

            {variableSuggestions.length > 0 && (
              <>
                <div className={styles.sectionHeader}>משתנות</div>
                <div className={styles.sectionHint}>סמן כמה עסקים כדי לאחד אותם לישות אחת של "הוצאות משתנות"</div>
                {variableSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.businessName}
                    suggestion={s}
                    linkableEntities={linkableEntities}
                    onAdd={onAddSuggestion}
                    onLinkExisting={onLinkExisting}
                    selection={{ checked: selectedVariable.has(s.businessName), onToggle: () => toggleVariable(s.businessName) }}
                  />
                ))}
                {selectedSuggestions.length > 0 && (
                  <div className={styles.combineBar}>
                    <span>
                      נבחרו {selectedSuggestions.length} · סה"כ {formatCurrency(selectedTotal)} לחודש
                    </span>
                    <button type="button" className={styles.addBtn} onClick={handleAddCombined}>
                      + הוסף כהוצאה משתנה מאוחדת
                    </button>
                  </div>
                )}
              </>
            )}

            {unclassifiedSuggestions.length > 0 && (
              <>
                <div className={styles.sectionHeader}>אחר</div>
                {unclassifiedSuggestions.map((s) => (
                  <SuggestionCard key={s.businessName} suggestion={s} linkableEntities={linkableEntities} onAdd={onAddSuggestion} onLinkExisting={onLinkExisting} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
