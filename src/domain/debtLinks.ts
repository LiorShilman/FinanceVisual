import type { CityBuilding } from './city';
import type { FinancialEntity } from './entity';

export interface DebtLinkPath {
  from: [number, number];
  to: [number, number];
}

/** Every debt's own linked entities — e.g. a mortgage chained to the home it's financing — traced
 * from the debt building to each linked building, the same way income link paths trace where
 * salary flows to, so the "this debt burdens this asset" relationship the user already set up via
 * linking shows up on the city map too. */
export function computeDebtLinkPaths(buildings: CityBuilding[], entities: FinancialEntity[]): DebtLinkPath[] {
  const positionById = new Map(buildings.map((b) => [b.id, [b.x, b.z] as [number, number]]));
  const paths: DebtLinkPath[] = [];
  for (const entity of entities) {
    if (entity.details.kind !== 'debt') continue;
    const from = positionById.get(entity.id);
    if (!from) continue;
    for (const linkedId of entity.linkedEntityIds) {
      const to = positionById.get(linkedId);
      if (to && (to[0] !== from[0] || to[1] !== from[1])) paths.push({ from, to });
    }
  }
  return paths;
}
