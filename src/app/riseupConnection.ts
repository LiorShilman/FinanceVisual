// Multi-tenant: every FinanceVisual account brings its own RiseUp PAT (stored in boardStore,
// synced through Firestore like the rest of the account's data — see boardStore.ts's
// `riseupPat`). This module only ever forwards that token as a bearer header to the shared
// RiseUp proxy server; the token is never stored or logged here, and the server itself is
// stateless per-request (see RiseUp/server/src/index.js's extractPat).
const RISEUP_SERVER_URL = import.meta.env.VITE_RISEUP_SERVER_URL || 'https://shilmanlior2608.ddns.net:36500';
const REQUEST_TIMEOUT_MS = 8000;

export type RiseupConnectionStatus = 'unset' | 'checking' | 'connected' | 'invalidPat' | 'unreachable';

export interface RiseupMonthStatus {
  income: number;
  expense: number;
  net: number;
}

interface RiseupBudgetEnvelope {
  actuals?: { isIncome?: boolean; incomeAmount?: number; billingAmount?: number; originalAmount?: number }[];
}

// Same totals the RiseUp dashboard itself shows (see RiseUp/client/src/monthlyActuals.js) —
// envelope-level planned amounts don't reconcile to real cashflow, so actual income/expense has
// to come from each envelope's nested `actuals` transactions instead.
function computeActualsTotals(envelopes: RiseupBudgetEnvelope[]): RiseupMonthStatus {
  let income = 0;
  let expense = 0;
  for (const env of envelopes) {
    for (const a of env.actuals ?? []) {
      if (a.isIncome) income += a.incomeAmount || 0;
      else expense += a.billingAmount ?? a.originalAmount ?? 0;
    }
  }
  return { income, expense, net: income - expense };
}

export interface RiseupBudgetResult {
  status: RiseupConnectionStatus;
  /** The real YYYY-MM RiseUp resolved `month` to — needed as-is for the /api/transactions call,
   * since that endpoint (unlike /api/budget) doesn't accept 'current'/'previous' shorthands. */
  budgetDate: string | null;
  data: RiseupMonthStatus | null;
}

function authHeaders(pat: string): HeadersInit {
  return { Authorization: `Bearer ${pat.trim()}` };
}

/** One call does double duty: it's both "is this account's PAT valid" and "what did it return" —
 * a 401 means an invalid/expired PAT, any other failure means the proxy itself is unreachable.
 * `month` accepts 'current' (default), 'previous', or an explicit 'YYYY-MM'. */
export async function fetchBudgetStatus(pat: string, month = 'current'): Promise<RiseupBudgetResult> {
  if (!pat.trim()) return { status: 'unset', budgetDate: null, data: null };
  try {
    const res = await fetch(`${RISEUP_SERVER_URL}/api/budget/${encodeURIComponent(month)}`, {
      headers: authHeaders(pat),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: 'invalidPat', budgetDate: null, data: null };
    if (!res.ok) return { status: 'unreachable', budgetDate: null, data: null };
    const json = (await res.json()) as { budgetDate?: string; envelopes?: RiseupBudgetEnvelope[] };
    return { status: 'connected', budgetDate: json.budgetDate ?? null, data: computeActualsTotals(json.envelopes ?? []) };
  } catch {
    return { status: 'unreachable', budgetDate: null, data: null };
  }
}

export interface RiseupTransaction {
  transactionId: string;
  transactionDate: string;
  businessName: string;
  amount: number;
  isIncome: boolean;
  categoryLabel?: string;
}

/** `cashflowMonth` must be a resolved 'YYYY-MM' (RiseUp/server's `/api/transactions` doesn't
 * accept 'current'/'previous') — get one from `fetchBudgetStatus`'s `budgetDate` first. */
export async function fetchTransactions(pat: string, cashflowMonth: string): Promise<RiseupTransaction[] | null> {
  try {
    const res = await fetch(`${RISEUP_SERVER_URL}/api/transactions?cashflowMonth=${encodeURIComponent(cashflowMonth)}`, {
      headers: authHeaders(pat),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { transactions?: RiseupTransaction[] };
    return json.transactions ?? [];
  } catch {
    return null;
  }
}
