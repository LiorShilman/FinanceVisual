import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../../app/boardStore';
import { fetchBudgetStatus, fetchTransactions, type RiseupMonthStatus, type RiseupTransaction } from '../../app/riseupConnection';
import { formatCurrency } from '../format';
import { LINKABLE_FIELDS } from '../../domain/entity';
import styles from './RiseupTransactionsPanel.module.css';

interface Props {
  onClose: () => void;
}

type SortKey = 'date' | 'amount' | 'business' | 'category';
type SortDir = 'asc' | 'desc';
type TypeFilter = 'all' | 'expense' | 'income';
type LoadState = 'loading' | 'ready' | 'error';

const NO_CATEGORY = 'ללא קטגוריה';

// A signed ICU-formatted string (not a plain "+"/"−" character glued on separately) — gluing an
// ASCII sign onto an RTL currency string as its own text node let the browser's bidi algorithm
// place it on the wrong visual side; folding the sign into the same Intl.NumberFormat call keeps
// it exactly where the locale's currency formatting rules put it.
const SIGNED_ILS = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
function formatSignedAmount(tx: RiseupTransaction): string {
  return SIGNED_ILS.format(tx.isIncome ? tx.amount : -tx.amount);
}

// A small fixed palette, assigned deterministically per category label (same label always gets
// the same color within a session) — plain uncolored pills made every category look identical,
// which was the "flatter than it should be" bit of feedback.
const CATEGORY_PALETTE = ['#3f9bd6', '#e2a33d', '#8f7fe0', '#34b06b', '#d6688f', '#5fc7c2', '#c98a4b', '#7f93e0'];
function categoryColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

function formatMonthLabel(budgetDate: string | null): string {
  if (!budgetDate) return '';
  const [year, month] = budgetDate.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date);
}

function formatTxDate(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

/**
 * A dedicated screen for browsing a month's real RiseUp transactions — the family panel's own
 * RiseUp section only ever shows the month's three headline totals; this is where you actually
 * look for "what did I spend at X" or "why did this month's grocery bill jump".
 */
export function RiseupTransactionsPanel({ onClose }: Props) {
  const riseupPat = useBoardStore((s) => s.riseupPat);
  const entities = useBoardStore((s) => s.entities);
  const updateEntity = useBoardStore((s) => s.updateEntity);

  // 'current' / 'previous' / an explicit 'YYYY-MM' picked via the native month input — mirrors
  // RiseUp/client's own MonthPicker, since /api/budget already accepts all three forms.
  const [month, setMonth] = useState<string>('current');

  // only ever written from the effect's async resolution, never synchronously — keyed by which
  // (pat, month) it actually answers, so a stale result from a previous selection doesn't flash
  // while a new fetch for the current selection is still in flight (same pattern as
  // FamilyPanel's riseupResult).
  interface LoadResult {
    pat: string;
    month: string;
    loadState: LoadState;
    budgetDate: string | null;
    monthStatus: RiseupMonthStatus | null;
    transactions: RiseupTransaction[] | null;
  }
  const [result, setResult] = useState<LoadResult | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // transaction-level linking: pick specific rows, then attach their business names to one
  // numeric field on one entity (see domain/entity.ts's riseupLink / LINKABLE_FIELDS).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linkEntityId, setLinkEntityId] = useState('');
  const [linkField, setLinkField] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchBudgetStatus(riseupPat, month).then((budgetResult) => {
      if (cancelled) return;
      if (budgetResult.status !== 'connected' || !budgetResult.budgetDate) {
        setResult({ pat: riseupPat, month, loadState: 'error', budgetDate: null, monthStatus: null, transactions: null });
        return;
      }
      fetchTransactions(riseupPat, budgetResult.budgetDate).then((txs) => {
        if (cancelled) return;
        setResult({
          pat: riseupPat,
          month,
          loadState: txs === null ? 'error' : 'ready',
          budgetDate: budgetResult.budgetDate,
          monthStatus: budgetResult.data,
          transactions: txs,
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [riseupPat, month]);

  const current = result?.pat === riseupPat && result?.month === month ? result : null;
  const loadState: LoadState = current?.loadState ?? 'loading';
  const budgetDate = current?.budgetDate ?? null;
  const monthStatus = current?.monthStatus ?? null;
  const transactions = current?.transactions ?? null;

  const categories = useMemo(() => {
    if (!transactions) return [];
    const set = new Set(transactions.map((t) => t.categoryLabel || NO_CATEGORY));
    return [...set].sort((a, b) => a.localeCompare(b, 'he'));
  }, [transactions]);

  // a transactionId from last month means nothing once this month's list has replaced it — clear
  // the selection right where the month itself changes, rather than watching for it in an effect.
  function changeMonth(next: string) {
    setMonth(next);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTxs = useMemo(() => (transactions ?? []).filter((t) => selectedIds.has(t.transactionId)), [transactions, selectedIds]);
  const selectedTotal = useMemo(() => selectedTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0), [selectedTxs]);

  // only entities whose kind actually has a numeric field worth comparing against RiseUp (a
  // 'source' node has none) show up as link targets.
  const linkableEntities = useMemo(() => entities.filter((e) => (LINKABLE_FIELDS[e.details.kind]?.length ?? 0) > 0), [entities]);
  const linkEntity = linkableEntities.find((e) => e.id === linkEntityId) ?? null;
  const linkFieldOptions = linkEntity ? (LINKABLE_FIELDS[linkEntity.details.kind] ?? []) : [];

  function handleLink() {
    if (!linkEntity || !linkField || selectedTxs.length === 0) return;
    const businessNames = [...new Set(selectedTxs.map((t) => t.businessName))];
    updateEntity(linkEntity.id, { riseupLink: { field: linkField, businessNames } });
    setSelectedIds(new Set());
    setLinkEntityId('');
    setLinkField('');
  }

  // per-business-name lookup of which entities already have it linked — drives the small "🔗"
  // badge on matching rows, so an already-linked transaction doesn't get silently re-linked
  // elsewhere without the user noticing it was already spoken for.
  const linksByBusiness = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of entities) {
      if (!e.riseupLink) continue;
      for (const b of e.riseupLink.businessNames) {
        map.set(b, [...(map.get(b) ?? []), e.name]);
      }
    }
    return map;
  }, [entities]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    let list = transactions;
    if (typeFilter === 'expense') list = list.filter((t) => !t.isIncome);
    if (typeFilter === 'income') list = list.filter((t) => t.isIncome);
    if (categoryFilter !== 'all') list = list.filter((t) => (t.categoryLabel || NO_CATEGORY) === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.businessName.toLowerCase().includes(q));

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
      else if (sortKey === 'amount') cmp = a.amount - b.amount;
      else if (sortKey === 'business') cmp = a.businessName.localeCompare(b.businessName, 'he');
      else cmp = (a.categoryLabel || NO_CATEGORY).localeCompare(b.categoryLabel || NO_CATEGORY, 'he');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [transactions, typeFilter, categoryFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  }

  function sortArrow(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' ▴' : ' ▾';
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>תנועות RiseUp</h2>
            <span className={styles.subtitle}>כל התנועות בפועל של החודש — עם סינון וחיפוש</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        <div className={styles.monthBar}>
          <button
            type="button"
            className={`${styles.monthPill} ${month === 'previous' ? styles.monthPillActive : ''}`}
            onClick={() => changeMonth('previous')}
          >
            חודש קודם
          </button>
          <button
            type="button"
            className={`${styles.monthPill} ${month === 'current' ? styles.monthPillActive : ''}`}
            onClick={() => changeMonth('current')}
          >
            חודש נוכחי
          </button>
          <label className={`${styles.monthPill} ${styles.monthCustom} ${month !== 'current' && month !== 'previous' ? styles.monthPillActive : ''}`}>
            📅 בחר חודש
            <input
              className={styles.monthCustomInput}
              type="month"
              value={month === 'current' || month === 'previous' ? '' : month}
              onChange={(e) => e.target.value && changeMonth(e.target.value)}
              aria-label="בחר חודש מותאם אישית"
            />
          </label>
          {budgetDate && <span className={styles.monthLabel}>{formatMonthLabel(budgetDate)}</span>}
        </div>

        {loadState === 'loading' && <div className={styles.state}>טוען נתונים מ-RiseUp…</div>}
        {loadState === 'error' && <div className={`${styles.state} ${styles.stateError}`}>שגיאה בטעינת הנתונים מ-RiseUp</div>}

        {loadState === 'ready' && (
          <>
            {monthStatus && (
              <div className={styles.summaryRow}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>הכנסות</span>
                  <span className={`${styles.summaryAmount} ${styles.summaryAmountIncome}`}>{formatCurrency(monthStatus.income)}</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>הוצאות</span>
                  <span className={styles.summaryAmount}>{formatCurrency(monthStatus.expense)}</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>מאזן</span>
                  <span className={`${styles.summaryAmount} ${monthStatus.net < 0 ? styles.summaryAmountNegative : styles.summaryAmountIncome}`}>
                    {formatCurrency(monthStatus.net)}
                  </span>
                </div>
              </div>
            )}

            <div className={styles.filtersRow}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="חיפוש לפי שם עסק…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className={styles.filterSelect} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">כל הקטגוריות</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select className={styles.filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
                <option value="all">הכל</option>
                <option value="expense">הוצאות בלבד</option>
                <option value="income">הכנסות בלבד</option>
              </select>
              <span className={styles.resultCount}>
                {filtered.length} מתוך {transactions?.length ?? 0} תנועות
              </span>
            </div>

            {selectedIds.size > 0 && (
              <div className={styles.linkBar}>
                <span className={styles.linkStatus}>
                  <strong>{selectedIds.size}</strong> תנועות נבחרו · סה״כ <strong>{formatCurrency(selectedTotal)}</strong>
                </span>
                <select
                  className={styles.linkSelect}
                  value={linkEntityId}
                  onChange={(e) => {
                    setLinkEntityId(e.target.value);
                    setLinkField('');
                  }}
                >
                  <option value="">קשר לישות…</option>
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
                  className={`${styles.linkBarBtn} ${styles.linkBarBtnPrimary}`}
                  disabled={!linkEntity || !linkField}
                  onClick={handleLink}
                >
                  קשר
                </button>
                <button type="button" className={styles.linkBarBtn} onClick={() => setSelectedIds(new Set())}>
                  נקה בחירה
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className={styles.empty}>אין תנועות תואמות</div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCol} />
                      <th className={styles.sortable} onClick={() => toggleSort('date')}>
                        תאריך{sortArrow('date')}
                      </th>
                      <th className={styles.sortable} onClick={() => toggleSort('business')}>
                        עסק{sortArrow('business')}
                      </th>
                      <th className={styles.sortable} onClick={() => toggleSort('category')}>
                        קטגוריה{sortArrow('category')}
                      </th>
                      <th className={styles.sortable} onClick={() => toggleSort('amount')}>
                        סכום{sortArrow('amount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((tx) => {
                      const label = tx.categoryLabel || NO_CATEGORY;
                      const linkedTo = linksByBusiness.get(tx.businessName);
                      return (
                        <tr
                          key={tx.transactionId}
                          className={`${tx.isIncome ? styles.rowIncome : styles.rowExpense} ${selectedIds.has(tx.transactionId) ? styles.rowSelected : ''}`}
                        >
                          <td className={styles.checkboxCol}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(tx.transactionId)}
                              onChange={() => toggleSelected(tx.transactionId)}
                            />
                          </td>
                          <td className={styles.colDate}>{formatTxDate(tx.transactionDate)}</td>
                          <td>
                            {tx.businessName}
                            {linkedTo && <span className={styles.linkedBadge}>🔗 {linkedTo.join(', ')}</span>}
                          </td>
                          <td>
                            <span
                              className={styles.categoryPill}
                              style={{ ['--pill-color' as string]: categoryColor(label) }}
                            >
                              {label}
                            </span>
                          </td>
                          <td className={`${styles.colAmount} ${tx.isIncome ? styles.colAmountIncome : ''}`}>{formatSignedAmount(tx)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
