import type { InsightsSummary } from '../domain/insights';

// Same shared FinanceVisual server the RiseUp proxy uses (see riseupConnection.ts) — one server,
// two unrelated features, each reading its own bearer token off the request.
const SERVER_URL = import.meta.env.VITE_RISEUP_SERVER_URL || 'https://shilmanlior2608.ddns.net:36600';
const REQUEST_TIMEOUT_MS = 20000;

export type InsightsFetchStatus = 'ok' | 'invalidKey' | 'unreachable';

export interface InsightsFetchResult {
  status: InsightsFetchStatus;
  insights: string[] | null;
}

/** Every account brings its own OpenAI key (see boardStore's `openaiKey`) — sent as a bearer
 * header straight to the shared server, never stored or logged here. A 401 means an invalid/
 * missing key; any other failure means the server (or OpenAI itself) is unreachable. */
export async function fetchInsights(apiKey: string, summary: InsightsSummary): Promise<InsightsFetchResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/insights`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: 'invalidKey', insights: null };
    if (!res.ok) return { status: 'unreachable', insights: null };
    const json = (await res.json()) as { insights?: string[] };
    return { status: 'ok', insights: json.insights ?? [] };
  } catch {
    return { status: 'unreachable', insights: null };
  }
}

export interface AskFetchResult {
  status: InsightsFetchStatus;
  answer: string | null;
}

/** A free-form question answered against the same summary fetchInsights sends — same bearer-key
 * pattern, just a direct-answer response instead of the fixed 2-3-bullet insights shape. */
export async function askQuestion(apiKey: string, summary: InsightsSummary, question: string): Promise<AskFetchResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/ask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, question }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401) return { status: 'invalidKey', answer: null };
    if (!res.ok) return { status: 'unreachable', answer: null };
    const json = (await res.json()) as { answer?: string };
    return { status: 'ok', answer: json.answer ?? null };
  } catch {
    return { status: 'unreachable', answer: null };
  }
}
