import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { fetchUsdToIlsRate } from '../../app/exchangeRate';
import styles from './CurrencyControl.module.css';

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'לא עודכן מעולם';
  return `עודכן ${new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

export function CurrencyControl() {
  const usdRate = useBoardStore((s) => s.usdRate);
  const setUsdRate = useBoardStore((s) => s.setUsdRate);
  const usdRateUpdatedAt = useBoardStore((s) => s.usdRateUpdatedAt);
  const autoUpdateUsdRate = useBoardStore((s) => s.autoUpdateUsdRate);
  const toggleAutoUpdateUsdRate = useBoardStore((s) => s.toggleAutoUpdateUsdRate);

  const [open, setOpen] = useState(false);
  const [rateInput, setRateInput] = useState(String(usdRate));
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const attemptedAutoUpdate = useRef(false);

  const refresh = async () => {
    setStatus('loading');
    try {
      const rate = await fetchUsdToIlsRate();
      setUsdRate(rate);
      setRateInput(String(rate));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  // opt-in only — fires once per app load, and only if the user turned this on themselves.
  useEffect(() => {
    if (autoUpdateUsdRate && !attemptedAutoUpdate.current) {
      attemptedAutoUpdate.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdateUsdRate]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function commitRate() {
    const value = Number(rateInput);
    if (Number.isFinite(value) && value > 0) setUsdRate(value);
    else setRateInput(String(usdRate));
  }

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button type="button" className={styles.rateBtn} onClick={() => setOpen((o) => !o)} title="שער דולר — כל ישות מוצגת במטבע שבו הוזנה">
        ⚙︎ 1$={usdRate.toFixed(2)}₪
      </button>

      {open && (
        <div className={styles.popover}>
          <label className={styles.field}>
            <span className={styles.label}>שער (₪ ל-1$)</span>
            <input
              type="number"
              step="0.01"
              className={styles.input}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={commitRate}
            />
          </label>
          <div className={styles.meta}>{status === 'error' ? 'שגיאה בטעינת השער — נסה שוב' : formatUpdatedAt(usdRateUpdatedAt)}</div>
          <button type="button" className={styles.refreshBtn} onClick={refresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'טוען…' : 'עדכן שער נוכחי'}
          </button>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={autoUpdateUsdRate} onChange={toggleAutoUpdateUsdRate} />
            <span>עדכון אוטומטי בכל טעינה</span>
          </label>
        </div>
      )}
    </div>
  );
}
