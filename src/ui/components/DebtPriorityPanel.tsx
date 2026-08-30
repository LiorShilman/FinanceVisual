import { useMemo, useState } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { amortize, computeDebtPayoffPlan } from '../../domain/debtPriority';
import { formatCurrency } from '../format';
import styles from './DebtPriorityPanel.module.css';

interface Props {
  onClose: () => void;
  onOpenEntity: (id: string) => void;
}

/** '4 שנים ו-3 חודשים', '7 חודשים', '<חודש' — a whole number of months reads as a strange unit
 * once it climbs past a year or so; nobody thinks of a 4-year loan as "48 חודשים". */
function formatDuration(months: number): string {
  if (months <= 0) return 'פחות מחודש';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months} חודשים`;
  const yearsPart = years === 1 ? 'שנה' : `${years} שנים`;
  if (rest === 0) return yearsPart;
  return `${yearsPart} ו-${rest} חודשים`;
}

/**
 * "Which debt should extra money go to first" — the one concrete decision a family juggling
 * several debts most often doesn't know how to make on its own. Ranked by domain/debtPriority.ts's
 * avalanche order (highest interest rate first, the order that actually minimizes total interest
 * paid), with each row's own real payoff time and remaining interest computed off the same three
 * fields every debt entity already carries — no new data entry required to get real, personalized
 * numbers instead of generic advice.
 */
export function DebtPriorityPanel({ onClose, onOpenEntity }: Props) {
  const entities = useBoardStore((s) => s.entities);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);

  const rows = useMemo(() => computeDebtPayoffPlan(entities), [entities]);
  const money = (amount: number) => (hideAmounts ? '•••' : formatCurrency(amount));

  // "what if I paid extra" — always simulated against the real #1 priority debt (never a debt the
  // user picks freely): that's the one avalanche order already says any extra money should go to,
  // so a what-if against a different debt would just be modeling a worse decision.
  const [extraPayment, setExtraPayment] = useState(0);
  const topDebt = rows[0];
  const simulation = topDebt && extraPayment > 0 ? amortize(topDebt.outstandingBalance, topDebt.monthlyPayment + extraPayment, topDebt.interestRatePct) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>עדיפות סגירת חובות</h2>
            <span className={styles.subtitle}>
              מדורג לפי שיטת "מפולת שלג" (avalanche) — ריבית גבוהה קודם. זו השיטה שבאמת חוסכת הכי הרבה כסף בטווח הארוך, לא
              משנה כמה חובות יש ובאיזה סדר הם נוצרו.
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>אין חובות עם יתרה פתוחה על הלוח</div>
        ) : (
          <>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th></th>
                    <th>שם</th>
                    <th className={styles.colNum}>יתרה</th>
                    <th className={styles.colNum}>ריבית שנתית</th>
                    <th className={styles.colNum}>תשלום חודשי</th>
                    <th className={styles.colNum}>זמן לסיום</th>
                    <th className={styles.colNum}>ריבית שנותרה לשלם</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.neverPaysOff ? styles.neverRow : row.priority === 1 ? styles.topRow : ''}
                      onClick={() => onOpenEntity(row.id)}
                    >
                      <td>
                        <span className={styles.priorityBadge}>{row.priority}</span>
                      </td>
                      <td className={styles.colName}>
                        {row.name}
                        {row.isMortgage && <span className={styles.mortgagePill}>(משכנתא)</span>}
                      </td>
                      <td className={styles.colNum}>{money(row.outstandingBalance)}</td>
                      <td className={styles.colNum}>{row.interestRatePct}%</td>
                      <td className={styles.colNum}>{money(row.monthlyPayment)}</td>
                      <td className={styles.colNum}>
                        {row.neverPaysOff ? (
                          <span className={styles.neverBadge}>⚠️ לא ייסגר לעולם</span>
                        ) : (
                          formatDuration(row.monthsToPayoff!)
                        )}
                      </td>
                      <td className={styles.colNum}>{row.neverPaysOff ? '—' : money(row.totalInterestRemaining!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topDebt && (
              <div className={styles.simulator}>
                <label className={styles.simulatorLabel}>
                  מה אם תוסיף תשלום חודשי ל"{topDebt.name}" (עדיפות #1)?
                  <span className={styles.simulatorInputRow}>
                    <input
                      type="number"
                      min={0}
                      value={extraPayment || ''}
                      onChange={(e) => setExtraPayment(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      className={styles.simulatorInput}
                      placeholder="0"
                    />
                    ₪ לחודש
                  </span>
                </label>
                {simulation && (
                  <p className={styles.simulatorResult}>
                    {simulation.neverPaysOff
                      ? 'גם עם התוספת הזו, התשלום עדיין לא מכסה את הריבית החודשית — צריך סכום גבוה יותר כדי שהחוב בכלל יתחיל לקטון.'
                      : topDebt.neverPaysOff
                        ? `🎉 עם התוספת הזו, החוב הזה בכלל ייסגר (כרגע הוא לא ייסגר לעולם) — תוך ${formatDuration(simulation.months!)}, בריבית כוללת של ${money(simulation.totalInterest!)}.`
                        : `ייסגר תוך ${formatDuration(simulation.months!)} במקום ${formatDuration(topDebt.monthsToPayoff!)} — חוסך ${topDebt.monthsToPayoff! - simulation.months!} חודשים ו-${money(Math.max(0, topDebt.totalInterestRemaining! - simulation.totalInterest!))} בריבית.`}
                  </p>
                )}
              </div>
            )}

            <p className={styles.footnote}>
              🎯 עדיפות #1: כל תשלום נוסף שתפנה מעבר למינימום — כדאי שיילך לחוב המודגש למעלה. סגירתו קודם חוסכת יותר ריבית
              מאשר כל סדר אחר.
              {rows.some((r) => r.neverPaysOff) &&
                ' ⚠️ חוב עם "לא ייסגר לעולם" — התשלום החודשי הנוכחי לא מכסה אפילו את הריבית שנצברת; היתרה שלו רק תגדל עד שהתשלום יעלה.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
