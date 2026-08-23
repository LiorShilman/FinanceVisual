// Deterministic, seedless "hills and valleys" height field — layered sine waves at irrational
// frequency ratios so the pattern never visibly repeats across the city, without pulling in an
// external noise library. Same input always gives the same output, so the ground mesh and every
// object placed on it agree on where "the ground" actually is at a given x/z.
//
// Disabled (0) per feedback: the relief was too subtle to read as intentional, and streams — each
// only sampling terrain height once at their own source, not along their full path to the lake/
// valley — went invisible wherever the ground dipped or rose between source and target. Left at 0
// rather than removed outright so every call site that already adjusts for "local ground height"
// keeps working (as a no-op) if this gets revisited later with per-point stream sampling instead.
const AMPLITUDE = 0;

export function getTerrainHeight(x: number, z: number): number {
  const h =
    Math.sin(x * 0.07 + z * 0.05) * 0.5 +
    Math.sin(x * 0.13 - z * 0.11 + 1.7) * 0.3 +
    Math.sin(x * 0.031 + z * 0.047 + 4.2) * 0.2;
  return h * AMPLITUDE;
}
