import { useMemo } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { computeActionPlan, type ActionItem } from '../../domain/actionPlan';
import type { MonthlyTransactions } from '../../domain/riseupSuggestions';
import { formatCurrency } from '../format';
import styles from './ActionPlanPanel.module.css';

interface Props {
  onClose: () => void;
  onOpenEntity: (id: string) => void;
  riseupMonthlyTransactions: MonthlyTransactions[];
}

const SEVERITY_ICON: Record<ActionItem['severity'], string> = { critical: '🔴', warning: '🟡', tip: '💡' };
const SEVERITY_CLASS: Record<ActionItem['severity'], string> = { critical: styles.itemCritical, warning: styles.itemWarning, tip: styles.itemTip };

/** Turns one ActionItem's raw numbers into an actual Hebrew title+detail — kept here, not in
 * domain/actionPlan.ts, so the domain layer stays currency-formatting-free like the rest of it
 * (see that file's own doc-comment). */
function renderItem(item: ActionItem, money: (amount: number) => string): { title: string; detail: string } {
  const d = item.data;
  switch (d.kind) {
    case 'runwayShortfall':
      return d.severity === 'critical'
        ? {
            title: 'יתרת העו״ש עלולה לא להספיק עד המשכורת',
            detail: `יש בעו"ש ${money(d.checkingTotal)}, אבל צפויים עוד ${money(d.recommendedBalance)} בחיובים ידועים בתוך ${d.daysUntilPayday} ימים עד המשכורת הבאה.`,
          }
        : {
            title: 'כדאי לעקוב אחרי היתרה עד המשכורת',
            detail: `יש בעו"ש ${money(d.checkingTotal)} מול ${money(d.recommendedBalance)} בחיובים ידועים עד המשכורת הבאה (בעוד ${d.daysUntilPayday} ימים) — מרווח קטן.`,
          };
    case 'debtNeverPaysOff':
      return {
        title: `${d.name}: התשלום החודשי לא מכסה את הריבית`,
        detail: 'היתרה של החוב הזה רק תגדל, לא תקטן, עד שהתשלום החודשי יעלה — כדאי לבדוק את זה בהקדם.',
      };
    case 'debtTopPriority':
      return {
        title: `עודף כסף? כדאי להפנות אותו ל"${d.name}"`,
        detail: `הריבית עליו הכי גבוהה (${d.interestRatePct}%) מכל החובות שלך — סגירתו קודם חוסכת הכי הרבה ריבית בטווח הארוך.`,
      };
    case 'emergencyFundGap':
      return d.severity === 'critical'
        ? { title: 'כמעט ואין קרן חירום', detail: `יש כיסוי ל-${d.monthsOfRunway.toFixed(1)} חודשים בלבד (מומלץ 3 לפחות) — חסרים ${money(d.gapToRecommended)} כדי להגיע ליעד.` }
        : {
            title: 'קרן החירום מתחת למינימום המומלץ',
            detail: `יש כיסוי ל-${d.monthsOfRunway.toFixed(1)} חודשים מתוך 3 המומלצים — חסרים עוד ${money(d.gapToRecommended)}.`,
          };
    case 'overCommitted':
      return {
        title: 'ההוצאות הקבועות עולות על ההכנסה',
        detail: `צרכים + רצונות + חיסכון מסתכמים ב-${money(d.needs + d.wants + d.savings)}, אבל ההכנסה היא ${money(d.income)} — משהו חייב להשתנות.`,
      };
    case 'needsTooHigh':
      return {
        title: 'הוצאות ה"צרכים" תופסות חלק גדול מדי מההכנסה',
        detail: `${Math.round(d.needsRatio * 100)}% מההכנסה הולך ל"צרכים" (מומלץ עד כ-50%) — נשאר פחות מקום לחיסכון ולגמישות.`,
      };
  }
}

/**
 * "What should I actually do next" — a single ranked list synthesized from every other already-
 * computed signal in the app (see domain/actionPlan.ts's own doc-comment for why this never
 * invents a new metric). Built for someone who wouldn't otherwise know which of several separate
 * panels/colors to check, let alone which one is most urgent right now.
 */
export function ActionPlanPanel({ onClose, onOpenEntity, riseupMonthlyTransactions }: Props) {
  const entities = useBoardStore((s) => s.entities);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);

  const items = useMemo(() => computeActionPlan(entities, riseupMonthlyTransactions), [entities, riseupMonthlyTransactions]);
  const money = (amount: number) => (hideAmounts ? '•••' : formatCurrency(amount));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>מה לעשות עכשיו</h2>
            <span className={styles.subtitle}>סינתזה מדורגת של כל הסימנים הקיימים בלוח — לא מדד חדש, רק סדר עדיפויות ברור.</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyEmoji}>🎉</span>
            לא מצאנו כרגע נקודות דחופות לטיפול — הנתונים שיש לנו נראים מאוזנים.
          </div>
        ) : (
          <>
            <div className={styles.list}>
              {items.map((item) => {
                const { title, detail } = renderItem(item, money);
                const clickable = item.entityId !== undefined;
                return (
                  <div
                    key={item.id}
                    className={`${styles.item} ${SEVERITY_CLASS[item.severity]} ${clickable ? styles.itemClickable : ''}`}
                    onClick={clickable ? () => onOpenEntity(item.entityId!) : undefined}
                  >
                    <span className={styles.itemIcon}>{SEVERITY_ICON[item.severity]}</span>
                    <div className={styles.itemBody}>
                      <div className={styles.itemTitle}>{title}</div>
                      <div className={styles.itemDetail}>{detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className={styles.footnote}>מדורג מהדחוף ביותר — כל שורה מבוססת על חישוב אמיתי שכבר קיים בלוח (cash runway, קרן חירום, 50/30/20, עדיפות חובות).</p>
          </>
        )}
      </div>
    </div>
  );
}
