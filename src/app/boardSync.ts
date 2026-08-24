import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useBoardStore } from './boardStore';
import { EMPTY_BOARD_STATE, getPersistedBoardState, PersistedBoardStateSchema, type PersistedBoardState } from './boardTransfer';
import { SEED_FAMILY_MEMBERS } from '../domain/seed';

// The key zustand's `persist` middleware used to write to before it was replaced by this Firestore
// sync — still worth reading once for a first-login migration, since real board data already
// sits there in the user's browser from before login existed.
const LEGACY_LOCAL_STORAGE_KEY = 'financevisual-board';
const SAVE_DEBOUNCE_MS = 800;

function boardDocRef(uid: string) {
  return doc(db, 'users', uid, 'board', 'main');
}

// Accounts created before EMPTY_BOARD_STATE started seeding a 'self' member (or one somehow
// deleted — though FamilyPanel's own UI blocks that) are stuck with no way to represent the
// account owner at all: FamilyPanel opens with nothing to name, and its own "add member" form
// deliberately excludes 'self' as a choosable relation, so there was no way to create one by hand
// either. This is the same kind of self-healing migration parseBoardState already does for
// per-field schema drift, just for a structural gap instead.
function ensureSelfMember(state: PersistedBoardState): PersistedBoardState {
  if (state.familyMembers.some((m) => m.relation === 'self')) return state;
  return { ...state, familyMembers: [...SEED_FAMILY_MEMBERS, ...state.familyMembers] };
}

// A raw type cast here (instead of actually validating) would mean every zod `.default`/`.catch`
// added to the schema over time — e.g. `assetType`/`expenseType` picking up a fallback when a
// field is missing or holds a since-removed enum value — never actually runs for data that was
// already saved before that field/fallback existed. Falling back to the raw data on a parse
// failure (rather than surfacing an error) keeps a genuinely malformed document from locking the
// user out of their own board.
function parseBoardState(raw: unknown): PersistedBoardState {
  const result = PersistedBoardStateSchema.safeParse(raw);
  if (result.success) return result.data;
  console.error('Board data failed schema validation, loading as-is:', result.error);
  return raw as PersistedBoardState;
}

async function loadBoardState(uid: string): Promise<PersistedBoardState | null> {
  const snap = await getDoc(boardDocRef(uid));
  return snap.exists() ? parseBoardState(snap.data()) : null;
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
 *
 * Returns `loading` so the caller can hold off rendering the board until the real data has
 * arrived — without this, the board briefly renders whatever the store's default state happens
 * to be (the free-mode tab) before snapping to the user's actual saved layout, on every hard
 * refresh.
 */
export function useBoardSync(uid: string | null): { loading: boolean } {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);
  // undefined = nothing loaded yet this session. Comparing against the current uid (rather than a
  // plain boolean flipped inside the effect) derives `loading` during render instead of needing a
  // synchronous setState at the top of the effect.
  const [loadedUid, setLoadedUid] = useState<string | null | undefined>(undefined);
  const loading = uid !== null && loadedUid !== uid;

  useEffect(() => {
    if (!uid) return;
    readyRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const remote = await loadBoardState(uid);
        if (cancelled) return;
        if (remote) {
          const migrated = ensureSelfMember(remote);
          useBoardStore.setState(migrated);
          if (migrated !== remote) await saveBoardState(uid, getPersistedBoardState());
        } else {
          // brand-new account: carry forward this browser's pre-login local data if there is any,
          // otherwise start genuinely empty — not the seed/demo board.
          const legacy = readLegacyLocalStorageBoard();
          useBoardStore.setState(ensureSelfMember(legacy ?? EMPTY_BOARD_STATE));
          await saveBoardState(uid, getPersistedBoardState());
        }
      } catch (err) {
        console.error('Failed to load/initialize board from Firestore:', err);
      }
      if (!cancelled) {
        readyRef.current = true;
        setLoadedUid(uid);
      }
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

  return { loading };
}
