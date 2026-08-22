import type { CityBuilding } from './city';

export interface NetWorthBreakdown {
  /** Investments + savings + study funds + pension, minus debt — the full headline figure. */
  total: number;
  /** Same, but pension excluded — pension isn't actually accessible, so this is the "can
   * actually use this money" figure, distinct from the total. */
  liquidOnly: number;
}

/** Still not full balance-sheet net worth (real estate isn't counted as an asset here), by
 * explicit request — just the growth categories minus debt, split with/without pension. */
export function computeNetWorthBreakdown(buildings: CityBuilding[]): NetWorthBreakdown {
  const sumOf = (category: CityBuilding['category']) =>
    buildings.filter((b) => b.category === category).reduce((sum, b) => sum + b.weight, 0);

  const liquidAssets = sumOf('savings') + sumOf('investment') + sumOf('studyFund');
  const pension = sumOf('pension');
  const debt = sumOf('debt');

  return {
    total: liquidAssets + pension - debt,
    liquidOnly: liquidAssets - debt,
  };
}
