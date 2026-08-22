import type { CityBuilding } from './city';
import type { FinancialEntity } from './entity';

export interface IncomeLinkPath {
  from: [number, number];
  to: [number, number];
}

/** Every income (or income *source*, like an employer) entity's own linked entities — e.g.
 * "this employer is the source of this salary, which funds this investment" — traced as a path
 * from the origin building to each linked building, so the money flow the user already set up via
 * linking shows up on the city map too, not just in the free-form 2D view. A `source` entity has
 * no amount of its own, but it's still where the chain starts. */
export function computeIncomeLinkPaths(buildings: CityBuilding[], entities: FinancialEntity[]): IncomeLinkPath[] {
  const positionById = new Map(buildings.map((b) => [b.id, [b.x, b.z] as [number, number]]));
  const paths: IncomeLinkPath[] = [];
  for (const entity of entities) {
    if (entity.details.kind !== 'income' && entity.details.kind !== 'source') continue;
    const from = positionById.get(entity.id);
    if (!from) continue;
    for (const linkedId of entity.linkedEntityIds) {
      const to = positionById.get(linkedId);
      if (to && (to[0] !== from[0] || to[1] !== from[1])) paths.push({ from, to });
    }
  }
  return paths;
}
