// Multi-tenant: every FinanceVisual account brings its own RiseUp PAT (stored in boardStore,
// synced through Firestore like the rest of the account's data — see boardStore.ts's
// `riseupPat`). This module only ever forwards that token as a bearer header to the shared
// RiseUp proxy server; the token is never stored or logged here, and the server itself is
// stateless per-request (see RiseUp/server/src/index.js's extractPat).
const RISEUP_SERVER_URL = import.meta.env.VITE_RISEUP_SERVER_URL || 'https://shilmanlior2608.ddns.net:36500';
const BUDGET_TIMEOUT_MS = 8000;

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

export interface RiseupMonthResult {
  status: RiseupConnectionStatus;
  data: RiseupMonthStatus | null;
}

/** One call does double duty: it's both "is this account's PAT valid" and "what did it return" —
 * a 401 means an invalid/expired PAT, any other failure means the proxy itself is unreachable. */
export async function fetchCurrentMonthStatus(pat: string): Promise<RiseupMonthResult> {
  if (!pat.trim()) return { status: 'unset', data: null };
  try {
    const res = await fetch(`${RISEUP_SERVER_URL}/api/budget/current`, {
      headers: { Authorization: `Bearer ${pat.trim()}` },
      signal: AbortSignal.timeout(BUDGET_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: 'invalidPat', data: null };
    if (!res.ok) return { status: 'unreachable', data: null };
    const data = (await res.json()) as { envelopes?: RiseupBudgetEnvelope[] };
    return { status: 'connected', data: computeActualsTotals(data.envelopes ?? []) };
  } catch {
    return { status: 'unreachable', data: null };
  }
}
