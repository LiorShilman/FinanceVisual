import { useMemo } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { CATEGORY_LABELS, type EntityCategory } from '../../domain/entity';
import {
  buildInvestmentTableRows,
  computeGrandTotal,
  INVESTMENT_TABLE_CATEGORIES,
  summarizeInvestmentTable,
  type InvestmentTableRow,
} from '../../domain/investmentsTable';
import { computeNetWorthBreakdown } from '../../domain/netWorth';
import { CATEGORY_ICONS } from '../icons';
import { formatCurrency } from '../format';
import styles from './InvestmentsTablePanel.module.css';

interface Props {
  onClose: () => void;
  onOpenEntity: (id: string) => void;
}

export function InvestmentsTablePanel({ onClose, onOpenEntity }: Props) {
  const entities = useBoardStore((s) => s.entities);
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const usdRate = useBoardStore((s) => s.usdRate);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);

  const rows = useMemo(() => buildInvestmentTableRows(entities, familyMembers), [entities, familyMembers]);
  const summaries = useMemo(() => summarizeInvestmentTable(rows), [rows]);
  const grandTotal = useMemo(() => computeGrandTotal(rows), [rows]);
  // same figure the city sun shows — liquid growth assets minus debt, pension excluded since
  // it isn't actually accessible money, kept consistent across both views.
  const netWorth = useMemo(() => computeNetWorthBreakdown(entities), [entities]);
  const rowsByCategory = useMemo(() => {
    const map = new Map<EntityCategory, InvestmentTableRow[]>();
    for (const row of rows) {
      if (!map.has(row.category)) map.set(row.category, []);
      map.get(row.category)!.push(row);
    }
    return map;
  }, [rows]);

  const money = (amount: number, currency: InvestmentTableRow['currency']) =>
    hideAmounts ? '•••' : formatCurrency(amount, currency, usdRate);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>טבלת נכסים צומחים</h2>
            <span className={styles.subtitle}>חיסכון, השקעות, פנסיה וקרן השתלמות — מפורט מול תמצית, כדי שקל יהיה לאתר חוסרים</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>אין עדיין נכסים צומחים על הלוח</div>
        ) : (
          <>
            <div className={styles.summaryRow}>
              {summaries.map((s) => (
                <div key={s.category} className={styles.summaryCard}>
                  <div className={styles.summaryCardHead}>
                    <span>{CATEGORY_ICONS[s.category]}</span>
                    <span>{CATEGORY_LABELS[s.category]}</span>
                  </div>
                  <div className={styles.summaryAmount}>{money(s.totalBalance, 'ils')}</div>
                  <div className={styles.summaryMeta}>
                    {s.count} ישויות
                    {s.gapCount > 0 && <span className={styles.summaryGap}> · {s.gapCount} פערים</span>}
                  </div>
                </div>
              ))}
              <div className={`${styles.summaryCard} ${styles.summaryCardLiquid}`}>
                <div className={styles.summaryCardHead}>
                  <span>💧</span>
                  <span>נזיל ללא פנסיה</span>
                </div>
                <div className={`${styles.summaryAmount} ${netWorth.liquidOnly < 0 ? styles.summaryAmountNegative : styles.summaryAmountLiquid}`}>
                  {money(netWorth.liquidOnly, 'ils')}
                </div>
                <div className={styles.summaryMeta}>חיסכון + השקעה + קרן השתלמות, פחות חובות</div>
              </div>
              <div className={`${styles.summaryCard} ${styles.summaryCardTotal}`}>
                <div className={styles.summaryCardHead}>
                  <span>Σ</span>
                  <span>סה״כ</span>
                </div>
                <div className={styles.summaryAmount}>{money(grandTotal.totalBalance, 'ils')}</div>
                <div className={styles.summaryMeta}>
                  {grandTotal.count} ישויות
                  {grandTotal.gapCount > 0 && <span className={styles.summaryGap}> · {grandTotal.gapCount} פערים</span>}
                </div>
              </div>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colName}>שם</th>
                    <th>קטגוריה</th>
                    <th>משויך ל</th>
                    <th className={styles.colNum}>יתרה</th>
                    <th className={styles.colNum}>הפקדה חודשית</th>
                    <th>נזילות</th>
                    <th className={styles.colNum}>קישורים</th>
                    <th className={styles.colGaps}>פערים בנתונים</th>
                  </tr>
                </thead>
                <tbody>
                  {INVESTMENT_TABLE_CATEGORIES.flatMap((category) => {
                    const catRows = rowsByCategory.get(category);
                    if (!catRows || catRows.length === 0) return [];
                    const summary = summaries.find((s) => s.category === category)!;
                    return [
                      ...catRows.map((row) => (
                        <tr key={row.id} className={row.gaps.length > 0 ? styles.rowHasGap : ''} onClick={() => onOpenEntity(row.id)}>
                          <td className={styles.colName}>{row.name}</td>
                          <td>
                            <span className={styles.categoryPill}>
                              {CATEGORY_ICONS[row.category]} {CATEGORY_LABELS[row.category]}
                            </span>
                          </td>
                          <td className={styles.dim}>{row.ownerNames.length > 0 ? row.ownerNames.join(', ') : '—'}</td>
                          <td className={styles.colNum}>{money(row.balance, row.currency)}</td>
                          <td className={styles.colNum}>
                            {row.monthlyContribution === null ? (
                              <span className={styles.na}>לא רלוונטי</span>
                            ) : (
                              money(row.monthlyContribution, row.currency)
                            )}
                          </td>
                          <td className={styles.dim}>{row.liquidityLabel}</td>
                          <td className={styles.colNum}>{row.linkedCount > 0 ? row.linkedCount : '—'}</td>
                          <td className={styles.colGaps}>
                            {row.gaps.length === 0 ? (
                              <span className={styles.gapOk}>✓ תקין</span>
                            ) : (
                              <div className={styles.gapBadges}>
                                {row.gaps.map((g) => (
                                  <span key={g.key} className={styles.gapBadge}>
                                    {g.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )),
                      <tr key={`${category}-subtotal`} className={styles.subtotalRow}>
                        <td colSpan={3}>סה״כ {CATEGORY_LABELS[category]}</td>
                        <td className={styles.colNum}>{money(summary.totalBalance, 'ils')}</td>
                        <td className={styles.colNum}>{money(summary.totalMonthlyContribution, 'ils')}</td>
                        <td colSpan={2}></td>
                        <td className={styles.colGaps}>{summary.gapCount > 0 ? `${summary.gapCount} פערים` : ''}</td>
                      </tr>,
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className={styles.grandTotalRow}>
                    <td colSpan={3}>סה״כ כולל</td>
                    <td className={styles.colNum}>{money(grandTotal.totalBalance, 'ils')}</td>
                    <td className={styles.colNum}>{money(grandTotal.totalMonthlyContribution, 'ils')}</td>
                    <td colSpan={2}></td>
                    <td className={styles.colGaps}>{grandTotal.gapCount > 0 ? `${grandTotal.gapCount} פערים` : '✓ הכל תקין'}</td>
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
