import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from './boardStore';
import { fetchRiseupTransactionHistory } from './riseupHistory';
import { buildRiseupSuggestions, type RiseupEntitySuggestion } from '../domain/riseupSuggestions';

// enough months to tell a genuinely recurring business apart from a one-off purchase (see
// domain/riseupSuggestions.ts), short enough that the sequential per-month fetch (RiseUp's own
// rate limit forbids firing them in parallel) doesn't take forever.
const MONTHS_BACK = 4;

export type RiseupSuggestionsLoadState = 'loading' | 'ready' | 'error';

export interface RiseupSuggestionsState {
  loadState: RiseupSuggestionsLoadState;
  suggestions: RiseupEntitySuggestion[];
  hasPat: boolean;
  /** Call once a suggestion has been turned into (or linked onto) a real entity — removes it from
   * the list immediately, without needing to re-scan RiseUp to notice it's now linked. */
  markResolved: (businessName: string) => void;
}

/** Lives in BoardScreen (above where RiseupSuggestionsPanel itself mounts/unmounts as the user
 * opens and closes it) so the multi-month scan — several sequential RiseUp API calls, each one
 * real network latency — only ever runs once per PAT, not once per panel open. Without this, going
 * through suggestions one at a time (create → panel closes → reopen for the next one) re-ran the
 * whole scan from scratch every single time, which is what actually made "creating an entity from
 * RiseUp" feel so much slower than the plain "+ ישות" button — the slowness was never the entity
 * creation itself, it was re-fetching data that hadn't changed. `enabled` gates the *first* fetch
 * (no surprise background RiseUp calls before the user ever opens the panel), but once started for
 * a given PAT it's cached regardless of how many times `enabled` toggles afterward. */
export function useRiseupSuggestions(enabled: boolean): RiseupSuggestionsState {
  const riseupPat = useBoardStore((s) => s.riseupPat);

  const [loadState, setLoadState] = useState<RiseupSuggestionsLoadState>('loading');
  const [suggestions, setSuggestions] = useState<RiseupEntitySuggestion[]>([]);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const startedForPatRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (startedForPatRef.current === riseupPat) return;
    startedForPatRef.current = riseupPat;
    setResolved(new Set());

    if (!riseupPat.trim()) {
      setLoadState('error');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    fetchRiseupTransactionHistory(riseupPat, MONTHS_BACK).then((monthly) => {
      if (cancelled) return;
      const gotAnyData = monthly.some((m) => m.transactions.length > 0);
      if (!gotAnyData) {
        setLoadState('error');
        return;
      }
      // entities read once, at fetch time — not a reactive dependency. Re-running this whole
      // multi-month scan every time any entity changes (including the one just created from a
      // suggestion) would defeat the entire point of caching it; markResolved already keeps a
      // just-added suggestion from reappearing without needing a fresh scan.
      setSuggestions(buildRiseupSuggestions(monthly, useBoardStore.getState().entities));
      setLoadState('ready');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, riseupPat]);

  function markResolved(businessName: string) {
    setResolved((prev) => new Set(prev).add(businessName));
  }

  return {
    loadState,
    suggestions: suggestions.filter((s) => !resolved.has(s.businessName)),
    hasPat: riseupPat.trim() !== '',
    markResolved,
  };
}
