import { z } from 'zod';
import { FinancialEntitySchema } from '../domain/entity';
import { FamilyMemberSchema } from '../domain/familyMember';
import { LAYOUT_MODES } from '../domain/layout';
import { useBoardStore } from './boardStore';

const PointSchema = z.object({ x: z.number(), y: z.number() });

// The same fields zustand's persist middleware used to write to localStorage — the store's
// action functions aren't part of the payload, only its data.
const PersistedBoardStateSchema = z.object({
  familyMembers: FamilyMemberSchema.array(),
  entities: FinancialEntitySchema.array(),
  layoutMode: z.enum(LAYOUT_MODES),
  freePositions: z.record(z.string(), PointSchema),
  entityOrder: z.record(z.string(), z.number()),
  hideAmounts: z.boolean(),
  usdRate: z.number(),
  usdRateUpdatedAt: z.string().nullable(),
  autoUpdateUsdRate: z.boolean(),
});

export type PersistedBoardState = z.infer<typeof PersistedBoardStateSchema>;

/** A genuinely new account's starting board — no demo data. The seed entities only make sense as
 * an in-browser first-run demo; a real new user signing up has their own real board to build, not
 * ours. */
export const EMPTY_BOARD_STATE: PersistedBoardState = {
  familyMembers: [],
  entities: [],
  layoutMode: 'free',
  freePositions: {},
  entityOrder: {},
  hideAmounts: false,
  usdRate: 3.7,
  usdRateUpdatedAt: null,
  autoUpdateUsdRate: false,
};

/** Pulls just the persisted fields out of the live store — same shape the JSON file holds. */
export function getPersistedBoardState(): PersistedBoardState {
  const state = useBoardStore.getState();
  return {
    familyMembers: state.familyMembers,
    entities: state.entities,
    layoutMode: state.layoutMode,
    freePositions: state.freePositions,
    entityOrder: state.entityOrder,
    hideAmounts: state.hideAmounts,
    usdRate: state.usdRate,
    usdRateUpdatedAt: state.usdRateUpdatedAt,
    autoUpdateUsdRate: state.autoUpdateUsdRate,
  };
}

/** Downloads the current board as a JSON file — a manual backup, and the same shape a future
 * cloud sync will read/write, so this file will also work as a one-time import into it later. */
export function exportBoardToFile(): void {
  const json = JSON.stringify(getPersistedBoardState(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financevisual-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  success: boolean;
  error?: string;
}

/** Replaces the entire board with a previously-exported file's contents — validated against the
 * real domain schemas first, so a hand-edited or unrelated JSON file fails loudly instead of
 * silently corrupting the board with malformed entities. */
export async function importBoardFromFile(file: File): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { success: false, error: 'הקובץ שנבחר אינו JSON תקין' };
  }

  const result = PersistedBoardStateSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: 'מבנה הנתונים בקובץ לא תואם לפורמט של FinanceVisual' };
  }

  useBoardStore.setState(result.data);
  return { success: true };
}
