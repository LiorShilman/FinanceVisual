import { useState } from 'react';
import styles from './CityControlPanel.module.css';

export interface GrowthForecastPanelData {
  entityId: string;
  entityName: string;
  balance: number;
  monthlyDeposit: number;
  annualReturnPct: number;
  years: number;
  finalBalance: number;
}

interface Props {
  // camera lock + image export only mean anything while the 3D city is actually on screen — the
  // asset table section stays available in every layout mode, so it's the one section not gated
  // by this.
  isCityMode: boolean;
  isCameraLocked: boolean;
  onLockCamera: () => void;
  onResetCamera: () => void;
  onDownloadImage: () => void;
  onShareImage: () => void;
  canShareImage: boolean;
  onOpenAssetTable: () => void;
  // present only while the growth-forecast calculator is open for some entity — forces the panel
  // open (see the effect below) so a person clicking "תחזית צמיחה" on a tree actually sees the
  // calculator appear, instead of it silently filling a collapsed panel.
  growthForecast: GrowthForecastPanelData | null;
  onChangeForecastYears: (years: number) => void;
  onChangeForecastMonthlyDeposit: (deposit: number) => void;
  onChangeForecastReturnPct: (pct: number) => void;
  onCloseForecast: () => void;
  formatAmount: (value: number) => string;
}

// per-browser UI preference (like the camera lock itself), not board data — collapsed by default
// so the map/canvas stays free of floating chrome until someone actually wants the controls.
const PANEL_EXPANDED_KEY = 'financevisual:cityControlPanelExpanded';

function loadExpanded(): boolean {
  return localStorage.getItem(PANEL_EXPANDED_KEY) === '1';
}

export function CityControlPanel({
  isCityMode,
  isCameraLocked,
  onLockCamera,
  onResetCamera,
  onDownloadImage,
  onShareImage,
  canShareImage,
  onOpenAssetTable,
  growthForecast,
  onChangeForecastYears,
  onChangeForecastMonthlyDeposit,
  onChangeForecastReturnPct,
  onCloseForecast,
  formatAmount,
}: Props) {
  const [expanded, setExpanded] = useState(loadExpanded);

  // adjusting state in response to a prop change, done during render (React's own recommended
  // pattern for this — see "Adjusting state based on a prop change" in the React docs) rather than
  // in an effect, which would commit once already collapsed and only force it open a render later.
  // Keyed on the entity id alone (not the whole growthForecast object, which is a fresh object
  // every render) so this only fires when a *different* forecast opens, not on every keystroke
  // inside the one already showing.
  const growthForecastEntityId = growthForecast?.entityId ?? null;
  const [prevForecastEntityId, setPrevForecastEntityId] = useState(growthForecastEntityId);
  if (growthForecastEntityId !== prevForecastEntityId) {
    setPrevForecastEntityId(growthForecastEntityId);
    if (growthForecastEntityId) setExpanded(true);
  }

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(PANEL_EXPANDED_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className={`${styles.panel} ${expanded ? styles.expanded : ''}`}>
      <button
        type="button"
        className={styles.toggleTab}
        onClick={toggleExpanded}
        aria-label={expanded ? 'סגור פאנל פקדים' : 'פתח פאנל פקדים'}
        aria-expanded={expanded}
        title="פקדי מפה ונתונים"
      >
        {expanded ? (
          // a plain '‹' character gets bidi-mirrored (flipped to point right) by the browser on
          // this RTL page — an SVG path isn't text, so it isn't subject to that and reliably
          // points toward the panel's own left edge (the direction collapsing it moves toward).
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          '⚙'
        )}
      </button>

      {expanded && (
        <div className={styles.body}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>נתונים</h3>
            <button type="button" className={styles.panelBtn} onClick={onOpenAssetTable}>
              📊 טבלת נכסים
            </button>
          </div>

          {growthForecast && (
            <div className={styles.section}>
              <div className={styles.forecastHeader}>
                <h3 className={styles.sectionTitle}>📈 תחזית צמיחה — {growthForecast.entityName}</h3>
                <button type="button" className={styles.forecastCloseBtn} onClick={onCloseForecast} aria-label="סגור תחזית">
                  ✕
                </button>
              </div>

              <label className={styles.forecastField}>
                <span>שנים קדימה</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  className={styles.forecastInput}
                  value={growthForecast.years}
                  onChange={(e) => onChangeForecastYears(Math.max(1, Math.min(40, Number(e.target.value))))}
                />
              </label>

              <label className={styles.forecastField}>
                <span>הפקדה חודשית (₪)</span>
                <input
                  type="number"
                  min={0}
                  className={styles.forecastInput}
                  value={growthForecast.monthlyDeposit}
                  onChange={(e) => onChangeForecastMonthlyDeposit(Math.max(0, Number(e.target.value)))}
                />
              </label>

              <label className={styles.forecastField}>
                <span>תשואה שנתית צפויה (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={styles.forecastInput}
                  value={growthForecast.annualReturnPct}
                  onChange={(e) => onChangeForecastReturnPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                />
              </label>

              <div className={styles.forecastSummary}>
                <span>יתרה נוכחית: {formatAmount(growthForecast.balance)}</span>
                <span className={styles.forecastFinal}>
                  בעוד {growthForecast.years} שנים: {formatAmount(growthForecast.finalBalance)}
                </span>
              </div>
            </div>
          )}

          {isCityMode && (
            <>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>מצלמה</h3>
                {isCameraLocked ? (
                  <button type="button" className={`${styles.panelBtn} ${styles.panelBtnActive}`} onClick={onResetCamera}>
                    🔓 בטל קיבוע מצלמה
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.panelBtn}
                    onClick={onLockCamera}
                    title="שומר את הזווית והגובה הנוכחיים ומחזיר אליהם בכל טעינה מחדש"
                  >
                    📌 קבע זווית מצלמה
                  </button>
                )}
              </div>

              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>ייצוא</h3>
                <button type="button" className={styles.panelBtn} onClick={onDownloadImage}>
                  ⬇️ הורדת תמונה
                </button>
                {canShareImage && (
                  <button type="button" className={styles.panelBtn} onClick={onShareImage}>
                    📤 שיתוף
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
