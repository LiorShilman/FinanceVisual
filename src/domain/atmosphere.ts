import type { CityBuilding } from './city';
import type { NetWorthBreakdown } from './netWorth';

export interface CityAtmosphere {
  background: string;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  ambientColor: string;
}

// The two ends of the interpolation — "healthy" is exactly CityView's existing fixed values (fog
// pushed out past the raised maxDistance=200, so a board with nothing at risk renders pixel-
// identical to before this existed. "Distressed" leans the same palette toward a dim, hazy red
// rather than introducing a new hue, so it still reads as "this city" under duress, not a
// different app — and pulls fog back in, since a hazier, shorter view fits "atmosphere" better
// than just a color shift on its own.
const HEALTHY = { bg: '#0a0c11', fogNear: 130, fogFar: 320, ambientIntensity: 1.5, ambientColor: '#ffffff' };
const DISTRESSED = { bg: '#170b0c', fogNear: 60, fogFar: 190, ambientIntensity: 1.15, ambientColor: '#e8c9b0' };

/** 0 (nothing to worry about) to 1 (as bad as the atmosphere gets) — driven by the same
 * `isAtRisk` flag the ground-level risk aura already uses (so "the weather matches what's
 * glowing red on the ground"), plus a flat bump when the whole board's net worth has gone
 * negative, which isAtRisk alone wouldn't necessarily catch (e.g. a debt-heavy board with no
 * single entity over its own risk threshold yet). */
export function computeCityDistress(buildings: CityBuilding[], netWorth: NetWorthBreakdown): number {
  const riskRatio = buildings.length > 0 ? buildings.filter((b) => b.isAtRisk).length / buildings.length : 0;
  const negativeNetWorth = netWorth.total < 0 ? 0.35 : 0;
  return Math.min(1, riskRatio * 1.4 + negativeNetWorth);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t));
}

/** The city's overall "weather" — background/fog color, fog distance, and ambient light all
 * shift together from the healthy baseline toward a dim, hazy red as more of the board reads as
 * at-risk. A perfectly healthy board renders with exactly the original fixed values. */
export function computeCityAtmosphere(buildings: CityBuilding[], netWorth: NetWorthBreakdown): CityAtmosphere {
  const t = computeCityDistress(buildings, netWorth);
  return {
    background: lerpColor(HEALTHY.bg, DISTRESSED.bg, t),
    fogNear: lerp(HEALTHY.fogNear, DISTRESSED.fogNear, t),
    fogFar: lerp(HEALTHY.fogFar, DISTRESSED.fogFar, t),
    ambientIntensity: lerp(HEALTHY.ambientIntensity, DISTRESSED.ambientIntensity, t),
    ambientColor: lerpColor(HEALTHY.ambientColor, DISTRESSED.ambientColor, t),
  };
}
