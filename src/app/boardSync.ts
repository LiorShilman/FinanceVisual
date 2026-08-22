import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useBoardStore } from './boardStore';
import { EMPTY_BOARD_STATE, getPersistedBoardState, type PersistedBoardState } from './boardTransfer';

// The key zustand's `persist` middleware used to write to before it was replaced by this Firestore
// sync — still worth reading once for a first-login migration, since real board data already
// sits there in the user's browser from before login existed.
const LEGACY_LOCAL_STORAGE_KEY = 'financevisual-board';
const SAVE_DEBOUNCE_MS = 800;

function boardDocRef(uid: string) {
  return doc(db, 'users', uid, 'board', 'main');
}

async function loadBoardState(uid: string): Promise<PersistedBoardState | null> {
  const snap = await getDoc(boardDocRef(uid));
  return snap.exists() ? (snap.data() as PersistedBoardState) : null;
}

// Firestore's setDoc rejects any field explicitly holding `undefined` (not just nested — anywhere
// in the object graph), which real entities hit constantly: optional fields like `notes` or
// `liquidity` get set to `undefined` rather than omitted (e.g. EntityFormPanel's
// `notes: draft.notes.trim() || undefined`). JSON.stringify silently drops those; Firestore
// throws. Stripping them recursively before every write is far more robust than chasing down
// every call site that might produce one.
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v !== undefined) result[key] = stripUndefined(v);
    }
    return result as T;
  }
  return value;
}

async function saveBoardState(uid: string, state: PersistedBoardState): Promise<void> {
  await setDoc(boardDocRef(uid), stripUndefined(state));
}

/** zustand's `persist` wraps the saved value as `{ state, version }` — reading that shape once,
 * on the off chance this browser still has pre-login local data worth carrying forward. */
function readLegacyLocalStorageBoard(): PersistedBoardState | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: PersistedBoardState };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads the signed-in user's board from Firestore once, falling back to a one-time migration of
 * any pre-existing localStorage board on a brand-new account, then keeps Firestore in sync with
 * every subsequent local change on a short debounce. Deliberately not a zustand-`persist`
 * storage-engine swap (see the plan doc) — an explicit load-then-subscribe is easier to reason
 * about than fighting persist's rehydration lifecycle across login/logout.
 */
export function useBoardSync(uid: string | null): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    readyRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const remote = await loadBoardState(uid);
        if (cancelled) return;
        if (remote) {
          useBoardStore.setState(remote);
        } else {
          // brand-new account: carry forward this browser's pre-login local data if there is any,
          // otherwise start genuinely empty — not the seed/demo board.
          const legacy = readLegacyLocalStorageBoard();
          useBoardStore.setState(legacy ?? EMPTY_BOARD_STATE);
          await saveBoardState(uid, getPersistedBoardState());
        }
      } catch (err) {
        console.error('Failed to load/initialize board from Firestore:', err);
      }
      if (!cancelled) readyRef.current = true;
    })();

    const unsubscribe = useBoardStore.subscribe(() => {
      // ignore changes fired while the initial load itself is still writing into the store
      if (!readyRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveBoardState(uid, getPersistedBoardState()).catch((err: unknown) => {
          console.error('Failed to save board to Firestore:', err);
        });
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [uid]);
}
