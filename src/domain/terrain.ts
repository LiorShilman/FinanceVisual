// Deterministic, seedless "hills and valleys" height field — layered sine waves at irrational
// frequency ratios so the pattern never visibly repeats across the city, without pulling in an
// external noise library. Same input always gives the same output, so the ground mesh and every
// object placed on it agree on where "the ground" actually is at a given x/z.
//
// Amplitude is deliberately gentle: buildings range roughly 0.6–9 units tall, and only a subset
// of ground-level objects (buildings, the lake/valley, streams, debt chains, income links) sample
// this and adjust their own Y — floating decorative elements (labels, the sun) don't. A small
// amplitude keeps anything that doesn't sample it from looking obviously wrong, while still
// giving the ground real, visible relief.
const AMPLITUDE = 0.55;

export function getTerrainHeight(x: number, z: number): number {
  const h =
    Math.sin(x * 0.07 + z * 0.05) * 0.5 +
    Math.sin(x * 0.13 - z * 0.11 + 1.7) * 0.3 +
    Math.sin(x * 0.031 + z * 0.047 + 4.2) * 0.2;
  return h * AMPLITUDE;
}
