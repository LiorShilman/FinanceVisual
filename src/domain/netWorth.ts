import { getCategory, getWeight, type EntityCategory, type FinancialEntity } from './entity';

export interface NetWorthBreakdown {
  /** Investments + savings + study funds + pension, minus debt — the full headline figure. */
  total: number;
  /** Same, but pension excluded — pension isn't actually accessible, so this is the "can
   * actually use this money" figure, distinct from the total. */
  liquidOnly: number;
}

/** Still not full balance-sheet net worth (real estate isn't counted as an asset here), by
 * explicit request — just the growth categories minus debt, split with/without pension. Works
 * directly off entities (not city buildings) so it's reusable anywhere — the 3D sun and the
 * investments table both need the exact same figure. */
export function computeNetWorthBreakdown(entities: FinancialEntity[]): NetWorthBreakdown {
  const sumOf = (category: EntityCategory) =>
    entities.filter((e) => getCategory(e) === category).reduce((sum, e) => sum + getWeight(e), 0);

  const liquidAssets = sumOf('savings') + sumOf('investment') + sumOf('studyFund');
  const pension = sumOf('pension');
  const debt = sumOf('debt');

  return {
    total: liquidAssets + pension - debt,
    liquidOnly: liquidAssets - debt,
  };
}
