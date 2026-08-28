import { useState } from 'react';
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
}

/** One suggestion, with two ways to resolve it: create it as a brand-new entity (the common case),
 * or — since the same real-world bill can show up under a different name than what was typed in by
 * hand (RiseUp's "עיריית תל אביב" vs. an entity the user already named "ארנונה") — link it onto an
 * existing entity instead, so a genuine duplicate doesn't get created. The detected frequency
 * (monthly/bimonthly/possibly-annual) is only ever a best guess from a few months of data — the
 * dropdown lets the user override it, which live-recomputes the suggested monthly amount to match
 * (see domain/riseupSuggestions.ts's computeMonthlyAmount). */
function SuggestionCard({ suggestion: s, linkableEntities, onAdd, onLinkExisting }: CardProps) {
  const [frequency, setFrequency] = useState<SuggestionFrequency>(s.frequency);
  const suggestedAmount = computeMonthlyAmount(s.rawAverageAmount, frequency);

  const [linkEntityId, setLinkEntityId] = useState('');
  const linkEntity = linkableEntities.find((e) => e.id === linkEntityId) ?? null;
  const linkFieldOptions = linkEntity ? (LINKABLE_FIELDS[linkEntity.details.kind] ?? []) : [];
  const [linkField, setLinkField] = useState('');

  return (
    <div className={styles.card}>
      <div className={styles.cardTopRow}>
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
 */
export function RiseupSuggestionsPanel({ loadState, suggestions, hasPat, onClose, onAddSuggestion, onLinkExisting }: Props) {
  const entities = useBoardStore((s) => s.entities);

  // only entities whose kind actually has a numeric field worth linking to (a 'source' node has
  // none) — same filter RiseupTransactionsPanel's own linking UI uses. Sorted alphabetically so a
  // family with many entities can actually scan the dropdown instead of hunting through creation
  // order.
  const linkableEntities = entities
    .filter((e) => (LINKABLE_FIELDS[e.details.kind]?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

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
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.businessName}
                suggestion={s}
                linkableEntities={linkableEntities}
                onAdd={onAddSuggestion}
                onLinkExisting={onLinkExisting}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
