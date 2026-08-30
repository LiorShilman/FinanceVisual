import { useMemo, useState } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { computeCashRunway, daysInMonth } from '../../domain/cashRunway';
import { computePaymentCalendar, type CalendarEvent } from '../../domain/paymentCalendar';
import type { MonthlyTransactions } from '../../domain/riseupSuggestions';
import { formatCurrency } from '../format';
import styles from './PaymentCalendarPanel.module.css';

interface Props {
  onClose: () => void;
  onOpenEntity: (id: string) => void;
  riseupMonthlyTransactions: MonthlyTransactions[];
}

const MONTH_NAMES = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];
const WEEKDAY_HEADS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** The net for one day, signed so ICU's own currency formatting places the sign correctly (see
 * the event-row rendering below's own doc-comment on why a hand-built '+'/'-' character is never
 * concatenated next to a formatted amount). */
function netFor(dayEvents: CalendarEvent[]): number {
  return dayEvents.reduce((sum, e) => sum + (e.isIncome ? e.amount : -e.amount), 0);
}

function groupByDay(events: CalendarEvent[]): Map<number, CalendarEvent[]> {
  const map = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    if (!map.has(event.day)) map.set(event.day, []);
    map.get(event.day)!.push(event);
  }
  return map;
}

interface SelectedDate {
  year: number;
  month: number;
  day: number;
}

function sameDate(a: SelectedDate, year: number, month: number, day: number): boolean {
  return a.year === year && a.month === month && a.day === day;
}

interface MonthGridProps {
  year: number;
  month: number;
  /** The full month's real day count, or a smaller cutoff for the "next month, but only up to
   * payday" section below — the grid simply doesn't render cells past this, rather than rendering
   * the whole month and dimming the part that isn't relevant yet. */
  dayLimit: number;
  byDay: Map<number, CalendarEvent[]>;
  today: Date;
  selected: SelectedDate;
  onSelectDay: (year: number, month: number, day: number) => void;
  hideAmounts: boolean;
}

/** One month's grid — factored out since the panel now renders this twice (the current month, and
 * optionally a partial next-month section up to the next payday, see the component's own
 * doc-comment on why). */
function MonthGrid({ year, month, dayLimit, byDay, today, selected, onSelectDay, hideAmounts }: MonthGridProps) {
  // getDay(): 0=Sunday..6=Saturday — exactly the Israeli week's own start-of-week convention, no
  // shift needed to line the 1st up under the right weekday header.
  const firstWeekday = new Date(year, month, 1).getDay();
  return (
    <div className={styles.grid}>
      {Array.from({ length: firstWeekday }, (_, i) => (
        <div key={`blank-${i}`} className={`${styles.cell} ${styles.cellBlank}`} />
      ))}
      {Array.from({ length: dayLimit }, (_, i) => i + 1).map((day) => {
        const dayEvents = byDay.get(day) ?? [];
        const net = netFor(dayEvents);
        const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
        const isPast = year === today.getFullYear() && month === today.getMonth() && day < today.getDate();
        const isSelected = sameDate(selected, year, month, day);
        return (
          <div
            key={day}
            className={[
              styles.cell,
              isToday ? styles.cellToday : '',
              isPast && !isToday ? styles.cellPast : '',
              isSelected ? styles.cellSelected : '',
            ].join(' ')}
            onClick={() => onSelectDay(year, month, day)}
          >
            <span className={styles.cellDayNum}>{day}</span>
            {dayEvents.length > 0 && (
              <>
                <span className={styles.cellDots}>
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.entityId} className={`${styles.dot} ${e.isIncome ? styles.dotIncome : styles.dotOutflow}`} />
                  ))}
                </span>
                {!hideAmounts && (
                  <span className={`${styles.cellNet} ${net >= 0 ? styles.cellNetPositive : styles.cellNetNegative}`}>
                    {formatCurrency(net)}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * "On which actual day does money move" — a real month grid (not a scrolling list of small rows),
 * so the whole month's rhythm reads at a glance the way a real calendar does, with one day's full
 * detail expanded below it. Reuses the exact same date resolution domain/cashRunway.ts and
 * domain/budgetSplitTable.ts already do (RiseUp history first, falling back to a manual
 * payDay/chargeDay) via domain/paymentCalendar.ts. Redesigned 2026-08-29 from an earlier flat-list
 * version that read as too small/cramped to actually use.
 *
 * Also shows a second, partial grid for *next* month whenever the real next payday (see
 * computeCashRunway's own nextPaydayDate) actually falls there — late in the month, the current
 * month alone doesn't even include the payday itself or the few charges landing right before it
 * (feedback 2026-08-30). Capped at the payday's own day, not the whole next month — the point is
 * "the stretch until you get paid", not a second full calendar.
 */
export function PaymentCalendarPanel({ onClose, onOpenEntity, riseupMonthlyTransactions }: Props) {
  const entities = useBoardStore((s) => s.entities);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);

  const today = useMemo(() => new Date(), []);
  const [selected, setSelected] = useState<SelectedDate>({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });

  const events = useMemo(() => computePaymentCalendar(entities, riseupMonthlyTransactions, today), [entities, riseupMonthlyTransactions, today]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const totalDays = daysInMonth(today.getFullYear(), today.getMonth());

  // checkingTotal doesn't matter here — 0 is fine, only nextPaydayDate itself is used.
  const runway = useMemo(() => computeCashRunway(entities, riseupMonthlyTransactions, 0, today), [entities, riseupMonthlyTransactions, today]);
  const nextPayday = runway?.nextPaydayDate ?? null;
  const showNextMonth = nextPayday !== null && (nextPayday.getFullYear() !== today.getFullYear() || nextPayday.getMonth() !== today.getMonth());

  const nextMonthDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 1), [today]);
  const nextMonthEvents = useMemo(
    () => (showNextMonth ? computePaymentCalendar(entities, riseupMonthlyTransactions, nextMonthDate) : []),
    [entities, riseupMonthlyTransactions, nextMonthDate, showNextMonth],
  );
  const nextMonthByDay = useMemo(() => groupByDay(nextMonthEvents), [nextMonthEvents]);

  const money = (amount: number) => (hideAmounts ? '•••' : formatCurrency(amount));
  const isSelectedInCurrentMonth = selected.year === today.getFullYear() && selected.month === today.getMonth();
  const selectedEvents = (isSelectedInCurrentMonth ? byDay : nextMonthByDay).get(selected.day) ?? [];
  const selectedNet = netFor(selectedEvents);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>לוח תזרים חודשי</h2>
            <span className={styles.subtitle}>
              {MONTH_NAMES[today.getMonth()]} {today.getFullYear()} — מתי כסף נכנס ויוצא בפועל, יום אחר יום.
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {events.length === 0 && nextMonthEvents.length === 0 ? (
          <div className={styles.empty}>אין עדיין תאריכים ידועים (ידניים או מ-RiseUp) לאף הכנסה/הוצאה</div>
        ) : (
          <>
            <div className={styles.body}>
              <div className={styles.weekdayRow}>
                {WEEKDAY_HEADS.map((w) => (
                  <div key={w} className={styles.weekdayHead}>
                    {w}
                  </div>
                ))}
              </div>

              <MonthGrid
                year={today.getFullYear()}
                month={today.getMonth()}
                dayLimit={totalDays}
                byDay={byDay}
                today={today}
                selected={selected}
                onSelectDay={(year, month, day) => setSelected({ year, month, day })}
                hideAmounts={hideAmounts}
              />

              {showNextMonth && nextPayday && (
                <>
                  <div className={styles.nextMonthHeading}>
                    {MONTH_NAMES[nextMonthDate.getMonth()]} — עד המשכורת ({nextPayday.getDate()}/{nextPayday.getMonth() + 1})
                  </div>
                  <div className={styles.weekdayRow}>
                    {WEEKDAY_HEADS.map((w) => (
                      <div key={w} className={styles.weekdayHead}>
                        {w}
                      </div>
                    ))}
                  </div>
                  <MonthGrid
                    year={nextMonthDate.getFullYear()}
                    month={nextMonthDate.getMonth()}
                    dayLimit={nextPayday.getDate()}
                    byDay={nextMonthByDay}
                    today={today}
                    selected={selected}
                    onSelectDay={(year, month, day) => setSelected({ year, month, day })}
                    hideAmounts={hideAmounts}
                  />
                </>
              )}

              <div className={styles.detail}>
                <div className={styles.detailHeader}>
                  <span className={styles.detailTitle}>
                    {selected.day} ב{MONTH_NAMES[selected.month]}
                    {sameDate(selected, today.getFullYear(), today.getMonth(), today.getDate()) ? ' · היום' : ''}
                  </span>
                  {selectedEvents.length > 0 && !hideAmounts && (
                    <span className={`${styles.detailNet} ${selectedNet >= 0 ? styles.cellNetPositive : styles.cellNetNegative}`}>
                      נטו: {money(selectedNet)}
                    </span>
                  )}
                </div>

                {selectedEvents.length === 0 ? (
                  <p className={styles.detailEmpty}>אין תנועה ידועה ביום הזה</p>
                ) : (
                  selectedEvents.map((event) => (
                    <div key={event.entityId} className={styles.eventRow} onClick={() => onOpenEntity(event.entityId)}>
                      <span className={styles.eventIcon}>{event.isIncome ? '⬆️' : '⬇️'}</span>
                      <span className={styles.eventName}>{event.name}</span>
                      {/* the sign is never a hand-built '+'/'-' character next to the formatted
                          string — Intl.NumberFormat already wraps its own minus in bidi-isolation
                          marks (LRM/RLM) so it renders on the correct side inside this RTL page; a
                          manually concatenated sign sits outside that protection and visibly flips
                          to the wrong side instead (reported 2026-08-29). Passing the real signed
                          amount lets ICU own the sign entirely — same pattern already used for
                          every other signed amount in the app (RiseupTransactionsPanel/FamilyPanel's
                          own "net"). */}
                      <span className={`${styles.eventAmount} ${event.isIncome ? styles.income : styles.outflow}`}>
                        {money(event.isIncome ? event.amount : -event.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className={styles.footnote}>
              רק ימים עם תאריך ידוע (מ-RiseUp או שהוזן ידנית) מוצגים — הוצאה/הכנסה בלי תאריך לא מוצגת כאן במקום לנחש.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
