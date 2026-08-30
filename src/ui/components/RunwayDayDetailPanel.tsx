import { useBoardStore } from '../../app/boardStore';
import type { UpcomingCharge } from '../../domain/cashRunway';
import { formatCurrency } from '../format';
import styles from './RunwayDayDetailPanel.module.css';

interface Props {
  charges: UpcomingCharge[];
  onClose: () => void;
  onOpenEntity: (id: string) => void;
}

/**
 * The full breakdown for one day on the cash-runway track, when more than one charge lands there —
 * CityCashRunway.tsx's own beacon shows only a compact clickable summary in that case (see its own
 * doc-comment on why: stacking every charge as its own row in 3D space either overlapped or grew
 * unboundedly tall), this is the real list. A lightweight side panel, not a full-screen modal like
 * the bigger data tables — this is a quick "what exactly is this" lookup, not a destination.
 */
export function RunwayDayDetailPanel({ charges, onClose, onOpenEntity }: Props) {
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const money = (amount: number) => (hideAmounts ? '•••' : formatCurrency(amount));

  const total = charges.reduce((sum, c) => sum + c.amount, 0);
  const date = charges[0]?.date;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>
              {date ? `${date.getDate()}/${date.getMonth() + 1}` : ''} · {charges.length} חיובים
            </h2>
            {!hideAmounts && <span className={styles.subtitle}>{`סה"כ ${money(total)}`}</span>}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>
        <div className={styles.list}>
          {charges.map((charge) => (
            <div key={charge.entityId} className={styles.row} onClick={() => onOpenEntity(charge.entityId)}>
              <span className={styles.rowName}>{charge.label}</span>
              <span className={styles.rowAmount}>{money(charge.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
