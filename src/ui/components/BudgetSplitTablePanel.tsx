import { useMemo } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { computeBudgetSplit } from '../../domain/budgetSplit';
import { buildBudgetSplitRows, summarizeBudgetBuckets, type BudgetBucket, type BudgetSplitRow } from '../../domain/budgetSplitTable';
import { CATEGORY_LABELS } from '../../domain/entity';
import { CATEGORY_ICONS } from '../icons';
import { formatCurrency } from '../format';
import styles from './BudgetSplitTablePanel.module.css';

interface Props {
  onClose: () => void;
  onOpenEntity: (id: string) => void;
}

// needs/wants together are the literal "50/30" — savings and donations are both part of the same
// "20%" zone (see domain/budgetSplitTable.ts's own comment), shown as two groups within it rather
// than each carrying its own independent 20% target.
const BUCKET_LABELS: Record<BudgetBucket, string> = {
  needs: 'צרכים',
  wants: 'רצונות',
  savings: 'חיסכון',
  donations: 'תרומות',
};
const BUCKET_TARGET_PCT: Record<BudgetBucket, number> = {
  needs: 50,
  wants: 30,
  savings: 20,
  donations: 20,
};
const BUCKET_ICONS: Record<BudgetBucket, string> = {
  needs: '🧾',
  wants: '🎈',
  savings: '🐷',
  donations: '🎁',
};
const BUCKET_ORDER: BudgetBucket[] = ['needs', 'wants', 'savings', 'donations'];

export function BudgetSplitTablePanel({ onClose, onOpenEntity }: Props) {
  const entities = useBoardStore((s) => s.entities);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);

  const split = useMemo(() => computeBudgetSplit(entities), [entities]);
  const rows = useMemo(() => buildBudgetSplitRows(entities), [entities]);
  const summaries = useMemo(() => summarizeBudgetBuckets(rows, split.income), [rows, split.income]);
  const rowsByBucket = useMemo(() => {
    const map = new Map<BudgetBucket, BudgetSplitRow[]>();
    for (const row of rows) {
      if (!map.has(row.bucket)) map.set(row.bucket, []);
      map.get(row.bucket)!.push(row);
    }
    // biggest first within each bucket — the entities actually driving the percentage should be
    // the first thing seen, not wherever they happened to land in creation order.
    for (const bucketRows of map.values()) bucketRows.sort((a, b) => b.amount - a.amount);
    return map;
  }, [rows]);

  const money = (amount: number) => (hideAmounts ? '•••' : formatCurrency(amount));
  const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>חלוקת הכנסות 50/30/20</h2>
            <span className={styles.subtitle}>מה מרכיב כל פלח, לא רק אחוז — כדי שקל יהיה לזהות מה בדיוק דוחף את היחס</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {split.income <= 0 ? (
          <div className={styles.empty}>אין עדיין הכנסה חודשית על הלוח</div>
        ) : (
          <>
            <div className={styles.summaryRow}>
              {summaries.map((s) => (
                <div key={s.bucket} className={styles.summaryCard}>
                  <div className={styles.summaryCardHead}>
                    <span>{BUCKET_ICONS[s.bucket]}</span>
                    <span>{BUCKET_LABELS[s.bucket]}</span>
                  </div>
                  <div className={styles.summaryAmount}>{money(s.amount)}</div>
                  <div className={styles.summaryMeta}>
                    {pct(s.ratio)} מההכנסה · יעד {BUCKET_TARGET_PCT[s.bucket]}%
                  </div>
                </div>
              ))}
              <div className={`${styles.summaryCard} ${styles.summaryCardTotal}`}>
                <div className={styles.summaryCardHead}>
                  <span>💼</span>
                  <span>הכנסה חודשית</span>
                </div>
                <div className={styles.summaryAmount}>{money(split.income)}</div>
                <div className={styles.summaryMeta}>{split.unallocated > 0 ? `${money(split.unallocated)} לא מוקצה` : 'הכל מוקצה'}</div>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colName}>שם</th>
                    <th>קטגוריה</th>
                    <th>תאריך חיוב</th>
                    <th className={styles.colNum}>סכום חודשי</th>
                  </tr>
                </thead>
                <tbody>
                  {BUCKET_ORDER.flatMap((bucket) => {
                    const bucketRows = rowsByBucket.get(bucket);
                    if (!bucketRows || bucketRows.length === 0) return [];
                    const summary = summaries.find((s) => s.bucket === bucket)!;
                    return [
                      <tr key={`${bucket}-header`} className={styles.bucketHeaderRow}>
                        <td colSpan={4}>
                          {BUCKET_ICONS[bucket]} {BUCKET_LABELS[bucket]}
                        </td>
                      </tr>,
                      ...bucketRows.map((row) => (
                        <tr key={row.id} onClick={() => onOpenEntity(row.id)}>
                          <td className={styles.colName}>{row.name}</td>
                          <td>
                            <span className={styles.categoryPill}>
                              {CATEGORY_ICONS[row.category]} {CATEGORY_LABELS[row.category]}
                            </span>
                          </td>
                          {/* '' (blank), not "unknown"/"—" as a distinct word — no chargeDay set is
                              the common case (RiseUp-linked entities get their real day shown
                              elsewhere, on the cash runway itself, once actual history exists; this
                              is just the manually-entered fallback field), not an error state worth
                              calling out row by row. */}
                          <td className={styles.colDate}>{row.chargeDay !== undefined ? `${row.chargeDay} לחודש` : ''}</td>
                          <td className={styles.colNum}>{money(row.amount)}</td>
                        </tr>
                      )),
                      <tr key={`${bucket}-subtotal`} className={styles.subtotalRow}>
                        <td colSpan={3}>סה״כ {BUCKET_LABELS[bucket]}</td>
                        <td className={styles.colNum}>{money(summary.amount)}</td>
                      </tr>,
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className={styles.grandTotalRow}>
                    <td colSpan={3}>סה״כ מוקצה</td>
                    <td className={styles.colNum}>{money(split.needs + split.wants + split.savings)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
