import type { FamilyMember } from './familyMember';
import { LIQUIDITY_LABELS, getAutomaticLiquidity, isLiquidityRelevant, type FinancialEntity, type Liquidity } from './entity';
import { getEntityTier, PYRAMID_TIERS, type PyramidTier } from './pyramidTiers';
import { MAX_NODE_SIZE } from './sizing';

export const LAYOUT_MODES = ['free', 'byMember', 'byHorizon', 'byLiquidity', 'city'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export const LAYOUT_MODE_LABELS: Record<LayoutMode, string> = {
  free: 'חופשי',
  byMember: 'לפי בן משפחה',
  byHorizon: 'לפי טווח זמן',
  byLiquidity: 'לפי נזילות',
  city: 'עיר תלת-מימדית',
};

export const HORIZON_BUCKETS = ['current', 'shortTerm', 'longTerm'] as const;
export type HorizonBucket = (typeof HORIZON_BUCKETS)[number];

export const HORIZON_LABELS: Record<HorizonBucket, string> = {
  current: 'שוטף',
  shortTerm: 'טווח קצר',
  longTerm: 'טווח ארוך',
};

export function getHorizonBucket(entity: FinancialEntity): HorizonBucket {
  switch (entity.details.kind) {
    case 'income':
    case 'expense':
    case 'donation':
    case 'checking':
    case 'source':
      return 'current';
    case 'savings':
      return entity.details.isEmergencyFund ? 'current' : 'shortTerm';
    case 'debt':
    case 'goal':
      return 'shortTerm';
    case 'investment':
    case 'pension':
    case 'studyFund':
    case 'realEstate':
    case 'insurance':
      return 'longTerm';
  }
}

export interface Point {
  x: number;
  y: number;
}

const GRID_GAP = 40;
export const GRID_COLS = 3;
// fixed cell size (based on the largest possible node) guarantees no overlap regardless of actual node size
const CELL = MAX_NODE_SIZE + GRID_GAP;
const BUCKET_PADDING = 72;
export const BUCKET_WIDTH = GRID_COLS * CELL;
export const BUCKET_ROW_HEIGHT = CELL;
export const LABEL_HEADROOM = 60;

function packBucket(
  ids: string[],
  originX: number,
  originY: number,
  orderMap?: Record<string, number>,
): Record<string, Point> {
  const sorted = orderMap
    ? [...ids].sort((a, b) => {
        const oa = orderMap[a] ?? 1_000_000;
        const ob = orderMap[b] ?? 1_000_000;
        return oa - ob;
      })
    : ids;
  const positions: Record<string, Point> = {};
  sorted.forEach((id, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    positions[id] = { x: originX + col * CELL, y: originY + row * CELL };
  });
  return positions;
}

/** Which column an entity belongs to in a given bucketed mode — the single source of truth for both layout and drag/drop. */
export function getEntityBucketKey(entity: FinancialEntity, mode: Exclude<LayoutMode, 'free'>): string {
  if (mode === 'byMember') return entity.ownerIds[0] ?? 'unassigned';
  if (mode === 'byHorizon') return getHorizonBucket(entity);
  // byLiquidity
  // read-time guard against stale data: an old entity saved before liquidity was scoped to
  // savings/investment/pension might still carry a value that no longer applies — ignore it.
  const relevant = isLiquidityRelevant(entity.details.kind) || getAutomaticLiquidity(entity.details.kind) !== null;
  return relevant ? (entity.liquidity ?? 'other') : 'other';
}

type SideBySideMode = 'byMember' | 'byHorizon' | 'byLiquidity';

const BUCKET_ORDER: Record<Exclude<SideBySideMode, 'byMember'>, string[]> = {
  byHorizon: [...HORIZON_BUCKETS],
  byLiquidity: ['immediate', 'shortTerm', 'locked', 'other'],
};

function getBucketOrder(mode: SideBySideMode, familyMembers: FamilyMember[]): string[] {
  return mode === 'byMember' ? familyMembers.map((m) => m.id).concat('unassigned') : BUCKET_ORDER[mode];
}

/** Entity ids belonging to one bucket, in current display order (manual order first, then creation order). */
export function getOrderedBucketIds(
  entities: FinancialEntity[],
  mode: Exclude<LayoutMode, 'free'>,
  bucketKeyValue: string,
  entityOrder: Record<string, number>,
): string[] {
  const ids = entities.filter((e) => getEntityBucketKey(e, mode) === bucketKeyValue).map((e) => e.id);
  return [...ids].sort((a, b) => (entityOrder[a] ?? 1_000_000) - (entityOrder[b] ?? 1_000_000));
}

export interface BucketedLayoutResult {
  positions: Record<string, Point>;
  /** bucket key -> x offset, used for label positioning and drag/drop column detection */
  bucketLabelsX: Record<string, number>;
  /** one visible container panel per column, so the grouping reads as real sections, not floating labels */
  regions: PyramidBand[];
}

const MIN_REGION_ROWS = 1;

export function computeBucketedLayout(
  entities: FinancialEntity[],
  familyMembers: FamilyMember[],
  mode: SideBySideMode,
  entityOrder: Record<string, number> = {},
): BucketedLayoutResult {
  const order = getBucketOrder(mode, familyMembers);
  const buckets = new Map<string, string[]>();
  for (const key of order) buckets.set(key, []);

  for (const entity of entities) {
    const key = getEntityBucketKey(entity, mode);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(entity.id);
  }

  const positions: Record<string, Point> = {};
  const bucketLabelsX: Record<string, number> = {};
  const regions: PyramidBand[] = [];
  let x = 0;
  for (const key of order) {
    const ids = sortByOrder(buckets.get(key) ?? [], entityOrder);
    bucketLabelsX[key] = x;
    Object.assign(positions, packBucket(ids, x, LABEL_HEADROOM, entityOrder));
    const rows = Math.max(MIN_REGION_ROWS, Math.ceil(ids.length / GRID_COLS));
    regions.push({
      key,
      label: getColumnLabel(mode, key, familyMembers),
      x: x - 28,
      y: LABEL_HEADROOM - 30,
      width: BUCKET_WIDTH + 56,
      height: rows * CELL + 36,
      tier: null,
    });
    x += BUCKET_WIDTH + BUCKET_PADDING;
  }

  return { positions, bucketLabelsX, regions };
}

/** Human label for a bucket column header — shown as an in-flow label node, never a detached overlay. */
export function getColumnLabel(
  mode: Exclude<LayoutMode, 'free'>,
  key: string,
  familyMembers: FamilyMember[],
): string {
  if (mode === 'byMember') {
    if (key === 'unassigned') return 'ללא שיוך';
    return familyMembers.find((m) => m.id === key)?.name ?? key;
  }
  if (mode === 'byHorizon') return HORIZON_LABELS[key as HorizonBucket] ?? key;
  return key === 'other' ? 'לא רלוונטי' : (LIQUIDITY_LABELS[key as Liquidity] ?? key);
}

const TIER_SORT_ORDER: Record<string, number> = Object.fromEntries(PYRAMID_TIERS.map((t, i) => [t, i]));

/**
 * The default arrangement for 'free' mode before the user has dragged anything — a single tight
 * grid (not spread across bucket columns) so the board reads as one cluster instead of a thin
 * wide strip. Entities are sorted by pyramid tier so visually related items still land near each other.
 */
export function computeCompactDefaultLayout(entities: FinancialEntity[]): Record<string, Point> {
  const sorted = [...entities].sort((a, b) => {
    const ta = TIER_SORT_ORDER[getEntityTier(a) ?? ''] ?? PYRAMID_TIERS.length;
    const tb = TIER_SORT_ORDER[getEntityTier(b) ?? ''] ?? PYRAMID_TIERS.length;
    return ta - tb;
  });
  return packBucket(
    sorted.map((e) => e.id),
    0,
    LABEL_HEADROOM,
  );
}

export interface PyramidBand {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: PyramidTier | null;
}

function sortByOrder(ids: string[], entityOrder: Record<string, number>): string[] {
  return [...ids].sort((a, b) => (entityOrder[a] ?? 1_000_000) - (entityOrder[b] ?? 1_000_000));
}
