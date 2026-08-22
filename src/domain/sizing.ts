import { type FinancialEntity, getWeight } from './entity';

export const MIN_NODE_SIZE = 84;
export const MAX_NODE_SIZE = 220;

export function computeTotalWeight(entities: FinancialEntity[]): number {
  return entities.reduce((sum, e) => sum + Math.abs(getWeight(e)), 0);
}

/**
 * Node diameter driven by an entity's share of total household "financial mass".
 * Deliberately mixes flows (income/expense) and stocks (balances) into one scale —
 * the point is a felt sense of relative weight on the board, not accounting precision.
 * sqrt compresses the range so a mortgage doesn't visually erase everything else.
 */
export function computeNodeSize(weight: number, totalWeight: number): number {
  if (totalWeight <= 0) return MIN_NODE_SIZE;
  const share = Math.max(Math.abs(weight), 0) / totalWeight;
  const scaled = Math.sqrt(share);
  const size = MIN_NODE_SIZE + scaled * (MAX_NODE_SIZE - MIN_NODE_SIZE);
  return Math.round(Math.min(MAX_NODE_SIZE, Math.max(MIN_NODE_SIZE, size)));
}

// An absolute (not "relative to whatever else happens to exist") order-of-magnitude scale.
// Comparing two amounts against a shared, fixed reference — instead of against "the current
// biggest item in this dataset" — means their relative sizing is stable and predictable no
// matter what else is on the board, and differences between two SMALL amounts stay visible
// instead of both being crushed toward the floor whenever one huge outlier exists.
const MIN_MAGNITUDE = 2; // ~100 ₪ and below reads as "the floor"
const MAX_MAGNITUDE = 7; // ~10,000,000 ₪ and above reads as "the ceiling"

/** 0..1 share of a fixed ₪100 – ₪10,000,000 order-of-magnitude range. */
export function computeMagnitudeShare(weight: number): number {
  const abs = Math.abs(weight);
  if (abs <= 0) return 0;
  const magnitude = Math.log10(abs + 1);
  return Math.max(0, Math.min(1, (magnitude - MIN_MAGNITUDE) / (MAX_MAGNITUDE - MIN_MAGNITUDE)));
}

const MIN_RANK_STEP = 0.35; // guaranteed minimum visual step between neighboring ranks, in log10 units

/**
 * Size by rank order, but with each step sized by how big the actual magnitude gap is between
 * that item and its neighbor — a ₪1,000,000 pension next to a ₪50,000 emergency fund should look
 * dramatically bigger, not just "one step bigger". A hard floor per step still guarantees that
 * two close-but-different values (₪47,500 vs ₪11,583 — both "tens of thousands") never end up
 * looking identical, which a pure magnitude/log scale alone doesn't reliably give you.
 * Returns sizes in the same order as `weights` (ties keep their original relative order).
 */
export function computeRankSizes(weights: number[], min: number, max: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [max];

  const order = weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a]); // descending
  const sortedWeights = order.map((i) => Math.max(0, weights[i]));

  const cumulative = [0];
  for (let r = 1; r < n; r++) {
    const prev = sortedWeights[r - 1];
    const curr = sortedWeights[r];
    const logGap = prev > 0 && curr > 0 ? Math.log10(prev + 1) - Math.log10(curr + 1) : 0;
    cumulative.push(cumulative[r - 1] + Math.max(MIN_RANK_STEP, logGap));
  }
  const total = cumulative[n - 1];

  const sizes = new Array<number>(n);
  order.forEach((originalIndex, rank) => {
    const t = total > 0 ? cumulative[rank] / total : 0;
    sizes[originalIndex] = max - t * (max - min);
  });
  return sizes;
}
