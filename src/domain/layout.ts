import type { FamilyMember } from './familyMember';
import { LIQUIDITY_LABELS, getAutomaticLiquidity, isLiquidityRelevant, type FinancialEntity, type Liquidity } from './entity';
import { computeTierWeights, getEntityTier, PYRAMID_TIERS, PYRAMID_TIER_LABELS, type PyramidTier } from './pyramidTiers';
import { MAX_NODE_SIZE, computeRankSizes } from './sizing';

export const LAYOUT_MODES = ['free', 'byMember', 'byHorizon', 'byLiquidity', 'byPyramid', 'city'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export const LAYOUT_MODE_LABELS: Record<LayoutMode, string> = {
  free: 'חופשי',
  byMember: 'לפי בן משפחה',
  byHorizon: 'לפי טווח זמן',
  byLiquidity: 'לפי נזילות',
  byPyramid: 'לפי פירמידה',
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
      return 'current';
    case 'savings':
      return entity.details.isEmergencyFund ? 'current' : 'shortTerm';
    case 'debt':
    case 'goal':
      return 'shortTerm';
    case 'investment':
    case 'pension':
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
  if (mode === 'byLiquidity') {
    // read-time guard against stale data: an old entity saved before liquidity was scoped to
    // savings/investment/pension might still carry a value that no longer applies — ignore it.
    const relevant = isLiquidityRelevant(entity.details.kind) || getAutomaticLiquidity(entity.details.kind) !== null;
    return relevant ? (entity.liquidity ?? 'other') : 'other';
  }
  return getEntityTier(entity) ?? 'other';
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
  if (mode === 'byLiquidity') return key === 'other' ? 'לא רלוונטי' : (LIQUIDITY_LABELS[key as Liquidity] ?? key);
  if (key === 'other') return 'אחר';
  return PYRAMID_TIER_LABELS[key as (typeof PYRAMID_TIERS)[number]] ?? key;
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

// Band width is driven by how much money actually sits in that tier, ranked against the other
// populated tiers — a well-balanced household naturally tapers into a pyramid; an imbalanced one
// visibly doesn't, and two tiers of similar (but not identical) size still read as different.
const MIN_TIER_WIDTH = 300;
const MAX_TIER_WIDTH = 1080;
const TIER_GAP = 64;
const OTHER_WIDTH = 1080;

export interface PyramidBand {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: PyramidTier | null;
}

export interface PyramidLayoutResult {
  positions: Record<string, Point>;
  bands: PyramidBand[];
}

function sortByOrder(ids: string[], entityOrder: Record<string, number>): string[] {
  return [...ids].sort((a, b) => (entityOrder[a] ?? 1_000_000) - (entityOrder[b] ?? 1_000_000));
}

function packCenteredRow(ids: string[], centerX: number, y: number, maxWidth: number): Record<string, Point> {
  const maxCols = Math.max(1, Math.floor(maxWidth / CELL));
  const cols = ids.length > 0 ? Math.min(ids.length, maxCols) : maxCols;
  const originX = centerX - ((cols - 1) * CELL) / 2;
  const positions: Record<string, Point> = {};
  ids.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[id] = { x: originX + col * CELL, y: y + row * CELL };
  });
  return positions;
}

/**
 * The pyramid as an actual tapering shape (foundation wide at the bottom, peak narrow at the
 * top) instead of side-by-side columns — entities for each tier are packed into a centered row
 * within that tier's band. Non-tiered entities (income/expense/debt/goal) get their own zone
 * well below the pyramid, clearly separated rather than silently dropped.
 */
export function computeStackedPyramidLayout(
  entities: FinancialEntity[],
  entityOrder: Record<string, number> = {},
): PyramidLayoutResult {
  const byTier = new Map<PyramidTier, string[]>();
  for (const t of PYRAMID_TIERS) byTier.set(t, []);
  const otherIds: string[] = [];
  for (const e of entities) {
    const t = getEntityTier(e);
    if (t) byTier.get(t)!.push(e.id);
    else otherIds.push(e.id);
  }

  const tierWeights = computeTierWeights(entities);
  // rank, not raw magnitude — two tiers that are both "tens of thousands" still need to look
  // different from each other, which a shared log/magnitude scale won't reliably give you.
  const populatedTiersBottomUp = [...PYRAMID_TIERS].reverse().filter((t) => (byTier.get(t) ?? []).length > 0);
  const rankedWidths = computeRankSizes(
    populatedTiersBottomUp.map((t) => tierWeights[t]),
    MIN_TIER_WIDTH,
    MAX_TIER_WIDTH,
  );
  const tierWidthByRank = new Map(populatedTiersBottomUp.map((t, i) => [t, rankedWidths[i]]));

  const positions: Record<string, Point> = {};
  const bands: PyramidBand[] = [];
  let y = LABEL_HEADROOM;
  // only tiers that actually hold something get a band — an empty tier doesn't earn a place
  // in the shape, and skipping it keeps the pyramid compact instead of full of empty space.
  for (const tier of [...PYRAMID_TIERS].reverse()) {
    const ids = sortByOrder(byTier.get(tier) ?? [], entityOrder);
    if (ids.length === 0) continue;
    const width = tierWidthByRank.get(tier)!;
    const maxCols = Math.max(1, Math.floor(width / CELL));
    const rows = Math.ceil(ids.length / Math.min(ids.length, maxCols));
    Object.assign(positions, packCenteredRow(ids, 0, y, width));
    const height = rows * CELL + 36;
    bands.push({ key: tier, label: PYRAMID_TIER_LABELS[tier], x: -width / 2, y: y - 30, width, height, tier });
    y += height + TIER_GAP;
  }

  if (otherIds.length > 0) {
    const sorted = sortByOrder(otherIds, entityOrder);
    const maxCols = Math.max(1, Math.floor(OTHER_WIDTH / CELL));
    const rows = Math.ceil(sorted.length / Math.min(sorted.length, maxCols));
    Object.assign(positions, packCenteredRow(sorted, 0, y, OTHER_WIDTH));
    bands.push({
      key: 'other',
      label: 'אחר — הכנסות, הוצאות, חובות ויעדים',
      x: -OTHER_WIDTH / 2,
      y: y - 30,
      width: OTHER_WIDTH,
      height: rows * CELL + 36,
      tier: null,
    });
  }

  return { positions, bands };
}
