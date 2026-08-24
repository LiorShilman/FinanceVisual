import { useMemo, useState } from 'react';
import { MORTGAGE_TRACK_TYPE_LABELS, type DisplayCurrency, type MortgageTrack } from '../../domain/entity';
import { computeAmortizationSchedule } from '../../domain/mortgageSchedule';
import { formatCurrency } from '../format';
import styles from './MortgageScheduleModal.module.css';

interface Props {
  entityName: string;
  tracks: MortgageTrack[];
  currency: DisplayCurrency;
  usdRate: number;
  onClose: () => void;
}

export function MortgageScheduleModal({ entityName, tracks, currency, usdRate, onClose }: Props) {
  const [activeTrackId, setActiveTrackId] = useState(tracks[0]?.id ?? '');
  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? tracks[0];
  const schedule = useMemo(() => (activeTrack ? computeAmortizationSchedule(activeTrack) : null), [activeTrack]);

  const fmt = (v: number) => formatCurrency(v, currency, usdRate);

  if (!activeTrack) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>לוח סילוקין (שפיצר) — {entityName}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          {tracks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${t.id === activeTrack.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTrackId(t.id)}
            >
              {MORTGAGE_TRACK_TYPE_LABELS[t.trackType]}
            </button>
          ))}
        </div>

        {schedule && (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>יתרה נוכחית</span>
              <span className={styles.summaryValue}>{fmt(activeTrack.outstandingBalance)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>תשלום חודשי</span>
              <span className={styles.summaryValue}>{fmt(activeTrack.monthlyPayment)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>ריבית שנתית</span>
              <span className={styles.summaryValue}>{activeTrack.interestRatePct}%</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>זמן לסילוק מלא</span>
              <span className={styles.summaryValue}>
                {schedule.insufficientPayment ? '—' : `${schedule.payoffMonths} חודשים`}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>סך ריבית שתשולם</span>
              <span className={`${styles.summaryValue} ${styles.summaryValueWarning}`}>
                {schedule.insufficientPayment ? '—' : fmt(schedule.totalInterest)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>סך כל התשלומים</span>
              <span className={styles.summaryValue}>{schedule.insufficientPayment ? '—' : fmt(schedule.totalPayment)}</span>
            </div>
          </div>
        )}

        {schedule?.insufficientPayment && (
          <p className={styles.warning}>
            התשלום החודשי ({fmt(activeTrack.monthlyPayment)}) אינו מכסה אפילו את הריבית החודשית על היתרה הנוכחית — כך
            החוב רק גדל. יש להעלות את התשלום או להקטין את הריבית כדי שהמסלול יתחיל להיפרע.
          </p>
        )}

        {schedule && !schedule.insufficientPayment && schedule.rows.length === 0 && (
          <p className={styles.warning}>אין יתרת חוב במסלול זה.</p>
        )}

        {schedule && !schedule.insufficientPayment && schedule.rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>חודש</th>
                  <th>תשלום</th>
                  <th>קרן</th>
                  <th>ריבית</th>
                  <th>יתרה לאחר תשלום</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{fmt(row.payment)}</td>
                    <td>{fmt(row.principal)}</td>
                    <td className={styles.interestCell}>{fmt(row.interest)}</td>
                    <td>{fmt(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
