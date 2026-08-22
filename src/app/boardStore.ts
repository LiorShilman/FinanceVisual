import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FamilyMember } from '../domain/familyMember';
import type { FinancialEntity } from '../domain/entity';
import {
  type LayoutMode,
  type Point,
  type PyramidBand,
  computeBucketedLayout,
  computeCompactDefaultLayout,
  computeStackedPyramidLayout,
  getOrderedBucketIds,
} from '../domain/layout';
import { SEED_ENTITIES, SEED_FAMILY_MEMBERS } from '../domain/seed';

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

interface BoardState {
  familyMembers: FamilyMember[];
  entities: FinancialEntity[];
  layoutMode: LayoutMode;
  /** Manually-dragged positions in 'free' mode only — the other modes are always recomputed. */
  freePositions: Record<string, Point>;
  /** Manual within-category ordering (all bucketed modes share it) — sparse, only touched entities appear. */
  entityOrder: Record<string, number>;
  /** Mask displayed currency figures — for screen-sharing the board's shape without the exact numbers. */
  hideAmounts: boolean;

  setLayoutMode: (mode: LayoutMode) => void;
  toggleHideAmounts: () => void;

  addFamilyMember: (member: Omit<FamilyMember, 'id'>) => void;
  updateFamilyMember: (id: string, patch: Partial<Omit<FamilyMember, 'id'>>) => void;
  removeFamilyMember: (id: string) => void;

  addEntity: (entity: Omit<FinancialEntity, 'id'>) => void;
  updateEntity: (id: string, patch: Partial<Omit<FinancialEntity, 'id'>>) => void;
  removeEntity: (id: string) => void;

  setFreePosition: (id: string, pos: Point) => void;
  /** Move `id` to `targetIndex` within `orderedBucketIds` and persist fresh sequential order for that bucket. */
  reorderWithinBucket: (orderedBucketIds: string[], id: string, targetIndex: number) => void;
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      familyMembers: SEED_FAMILY_MEMBERS,
      entities: SEED_ENTITIES,
      layoutMode: 'free',
      freePositions: {},
      entityOrder: {},
      hideAmounts: false,

      setLayoutMode: (mode) => set({ layoutMode: mode }),
      toggleHideAmounts: () => set((state) => ({ hideAmounts: !state.hideAmounts })),

      addFamilyMember: (member) =>
        set((state) => ({
          familyMembers: [...state.familyMembers, { ...member, id: makeId('member') }],
        })),
      updateFamilyMember: (id, patch) =>
        set((state) => ({
          familyMembers: state.familyMembers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeFamilyMember: (id) =>
        set((state) => ({
          familyMembers: state.familyMembers.filter((m) => m.id !== id),
          entities: state.entities.map((e) => ({ ...e, ownerIds: e.ownerIds.filter((o) => o !== id) })),
        })),

      addEntity: (entity) =>
        set((state) => ({
          entities: [...state.entities, { ...entity, id: makeId('entity') }],
        })),
      updateEntity: (id, patch) =>
        set((state) => ({
          entities: state.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeEntity: (id) =>
        set((state) => ({
          entities: state.entities
            .filter((e) => e.id !== id)
            .map((e) => ({ ...e, linkedEntityIds: e.linkedEntityIds.filter((l) => l !== id) })),
          freePositions: Object.fromEntries(Object.entries(state.freePositions).filter(([key]) => key !== id)),
        })),

      setFreePosition: (id, pos) =>
        set((state) => ({ freePositions: { ...state.freePositions, [id]: pos } })),

      reorderWithinBucket: (orderedBucketIds, id, targetIndex) =>
        set((state) => {
          const withoutId = orderedBucketIds.filter((x) => x !== id);
          const clamped = Math.max(0, Math.min(withoutId.length, targetIndex));
          const next = [...withoutId.slice(0, clamped), id, ...withoutId.slice(clamped)];
          const updates: Record<string, number> = {};
          next.forEach((entityId, i) => {
            updates[entityId] = i;
          });
          return { entityOrder: { ...state.entityOrder, ...updates } };
        }),
    }),
    { name: 'financevisual-board' },
  ),
);

export interface BoardLayout {
  positions: Record<string, Point>;
  /** One container panel per column/tier — real in-flow nodes, empty in 'free' mode. */
  regions: PyramidBand[];
}

/** Resolved node positions for the current layout mode — bucketed modes are always derived, never stored. */
export function useBoardLayout(): BoardLayout {
  const entities = useBoardStore((s) => s.entities);
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const layoutMode = useBoardStore((s) => s.layoutMode);
  const freePositions = useBoardStore((s) => s.freePositions);
  const entityOrder = useBoardStore((s) => s.entityOrder);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (layoutMode === 'free' || layoutMode === 'city') {
      // 'city' has its own 3D renderer and doesn't consume positions/regions at all.
      const fallback = computeCompactDefaultLayout(entities);
      return { positions: { ...fallback, ...freePositions }, regions: [] };
    }
    if (layoutMode === 'byPyramid') {
      const { positions, bands } = computeStackedPyramidLayout(entities, entityOrder);
      return { positions, regions: bands };
    }
    const { positions, regions } = computeBucketedLayout(entities, familyMembers, layoutMode, entityOrder);
    return { positions, regions };
  }, [entities, familyMembers, layoutMode, freePositions, entityOrder]);
}

/** Ids currently in `bucketKeyValue`, in display order — used to compute a drag-and-drop reorder target. */
export function useOrderedBucketIds(mode: Exclude<LayoutMode, 'free'>, bucketKeyValue: string): string[] {
  const entities = useBoardStore((s) => s.entities);
  const entityOrder = useBoardStore((s) => s.entityOrder);
  return getOrderedBucketIds(entities, mode, bucketKeyValue, entityOrder);
}
