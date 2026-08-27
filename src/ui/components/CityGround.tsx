import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { computeGroundBounds, type CircularExtent } from '../../domain/cityGrid';
import { computeMagnitudeShare } from '../../domain/sizing';
import { getTerrainHeight } from '../../domain/terrain';
import type { ValleyFeature } from '../../domain/valley';
import type { StreamKind, WaterFeature } from '../../domain/water';

interface Props {
  groundCenter: [number, number];
  groundSize: number;
  water: WaterFeature;
  valley: ValleyFeature;
}

// checking's stream matches the teal that actually colors its own "פנוי להשקעה" (available for
// investment) text on the bridge (CityCheckingBridge's CHECKING_COLOR) — not the bridge deck's
// separate gold zone material, which is a different "available" convention (the deck surface
// split), not the one this label/stream pairing refers to.
const WATER_STREAM_COLOR: Record<StreamKind, string> = {
  pension: '#c2921f',
  checking: '#2fb0a0',
  liquid: '#4a90b8',
};

// the flat, unlit "פנוי להשקעה" text renders its hex exactly as authored, but the same hex on an
// emissive-lit metal tube reads noticeably brighter/lighter under the scene's lights — the shared
// 0.32 emissive intensity below washed checking's teal out into a much lighter, more cyan-looking
// turquoise than the text next to it. Toned down just for checking so the stream actually reads as
// the same teal, not a brighter cousin of it.
const WATER_STREAM_EMISSIVE_INTENSITY: Record<StreamKind, number> = {
  pension: 0.32,
  checking: 0.14,
  liquid: 0.32,
};

// Richly blended greens, no dry/dirt patches mixed in — a lawn of varying tone rather than a
// grass-meets-desert look. Many overlapping soft blobs read as a smooth gradient wash, the same
// "graded shades" treatment the water surfaces use, not a flat single fill.
function createGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2f5a2e';
  ctx.fillRect(0, 0, size, size);

  const grassShades = ['#3c6b38', '#4a7a41', '#335c2f', '#568a49', '#2a4f28', '#5f9750'];
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 110;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, grassShades[i % grassShades.length]);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.35 + Math.random() * 0.3;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A radial wash of several tones (not a flat fill) plus faint ripple rings — used for both water
// bodies so the lake and its pension halo read as rich, glossy water instead of a solid color.
function createWaterTexture(stops: [number, string][], rippleColor: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size * 0.4, size * 0.38, size * 0.02, size / 2, size / 2, size * 0.55);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = rippleColor;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.16 - i * 0.02;
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * (0.12 + i * 0.075), size * (0.08 + i * 0.055), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // a single bright glint, off-center and much higher-contrast than the faint ripple rings above —
  // those rings are centered on (and rotate around) the texture's own pivot point, so their motion
  // is a subtle change in a thin, faint ellipse's orientation, easy to miss entirely at normal
  // viewing distance. An off-center highlight sweeping around as the texture rotates (see
  // CityGround's own useFrame) is what actually reads clearly as "the water is moving."
  const glintGrad = ctx.createRadialGradient(size * 0.68, size * 0.28, 0, size * 0.68, size * 0.28, size * 0.22);
  glintGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
  glintGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glintGrad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // rotated slowly (see CityGround's own useFrame) to read as a gentle ripple/swirl instead of a
  // static painted pattern — pivoting around the texture's own center, not the default (0,0)
  // corner, so it actually spins in place rather than sliding/skewing around an off-center point.
  texture.center.set(0.5, 0.5);
  return texture;
}

// One shared, module-level "flow" texture — a repeating brightness pulse along the U axis
// (TubeGeometry's own along-length coordinate — see three.js's TubeGeometry.generateUVs), used as
// both `map` and `emissiveMap` on every stream tube so one animated offset (see CityGround's own
// useFrame) makes every stream's base color/glow pulse and travel along its own length, reading as
// flowing water instead of a static painted tube. Shared across every stream (water and valley
// alike) rather than one texture per stream — much cheaper, and the synchronized pulse across the
// whole city reads as coherent rather than each stream flowing to its own independent clock.
let sharedFlowTexture: THREE.CanvasTexture | null = null;
function getFlowTexture(): THREE.CanvasTexture {
  if (sharedFlowTexture) return sharedFlowTexture;
  const w = 128;
  const h = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3a3a3a');
  grad.addColorStop(0.1, '#ffffff');
  grad.addColorStop(0.26, '#3a3a3a');
  grad.addColorStop(0.6, '#3a3a3a');
  grad.addColorStop(0.72, '#ffffff');
  grad.addColorStop(0.88, '#3a3a3a');
  grad.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  sharedFlowTexture = texture;
  return texture;
}

// module-level singletons, not per-render useMemo — their colors are fixed literals, never derived
// from props, so there's nothing to recompute across renders anyway; keeping them as plain shared
// instances (matching getFlowTexture's own pattern above) also sidesteps the react-compiler's
// "don't mutate a hook-returned value" warning that useMemo here would trigger, since
// CityGround's own useFrame deliberately mutates their `.rotation` every frame for the ripple.
let sharedLakeTexture: THREE.CanvasTexture | null = null;
// a deeper, more muted sapphire-teal — the old bright cyan read as a swimming pool rather than a
// body of water holding value.
function getLakeTexture(): THREE.CanvasTexture {
  if (sharedLakeTexture) return sharedLakeTexture;
  sharedLakeTexture = createWaterTexture(
    [
      [0, '#7fc4d8'],
      [0.35, '#2f8fb8'],
      [0.7, '#155a82'],
      [1, '#0a2c40'],
    ],
    'rgba(255,255,255,0.4)',
  );
  return sharedLakeTexture;
}

let sharedRingTexture: THREE.CanvasTexture | null = null;
// pension money reads as "the golden years" better than lavender — purple had no real financial
// association here, just a hue that hadn't been used elsewhere in the city yet. The ring's own
// *center* sits underneath the inner lake mesh and is never actually seen — only the outer band
// (near UV=1) is visible — so the bright tone still has to sit at the outer stop or the ring reads
// as a dark, unrecognizable rim.
function getPensionRingTexture(): THREE.CanvasTexture {
  if (sharedRingTexture) return sharedRingTexture;
  sharedRingTexture = createWaterTexture(
    [
      [0, '#4a3a1a'],
      [0.5, '#9c7422'],
      [0.78, '#c2921f'],
      [1, '#d9ae3f'],
    ],
    'rgba(255,244,214,0.45)',
  );
  return sharedRingTexture;
}

let sharedValleyTexture: THREE.CanvasTexture | null = null;
// a canyon, not a pool — glowing embers rather than gentle ripples, but muted rather than neon so
// it doesn't outshine everything else in the district. Kept in the same red family as the expense
// buildings' own health-risk color (#e05a5a), not orange/amber — that hue is already claimed by
// every warning-status savings/investment/pension building, and an orange valley next to them read
// as ambiguous.
function getValleyTexture(): THREE.CanvasTexture {
  if (sharedValleyTexture) return sharedValleyTexture;
  sharedValleyTexture = createWaterTexture(
    [
      [0, '#d9897e'],
      [0.35, '#b84a4a'],
      [0.7, '#7a2530'],
      [1, '#3a1015'],
    ],
    'rgba(230,140,130,0.3)',
  );
  return sharedValleyTexture;
}

// Deterministic in [-1, 1] from a couple of coordinates — same stream always bends the same way
// across re-renders, without reaching for an impure Math.random() inside the render path.
function pseudoJitter(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

// A local-origin blob outline, meant to be rotated flat via rotation-x and moved into place via
// `position` on the mesh — keeping the randomness in local space means the rotation can never
// flip it into an invisible back-face, only mirror which side is bumpier.
function buildBlobShape(radius: number, points = 32): THREE.Shape {
  const rawRadii: number[] = [];
  for (let i = 0; i < points; i++) rawRadii.push(radius * (0.88 + Math.random() * 0.24));
  const radii = rawRadii.map((r, i) => {
    const prev = rawRadii[(i - 1 + points) % points];
    const next = rawRadii[(i + 1) % points];
    return (prev + r * 2 + next) / 4;
  });

  const shape = new THREE.Shape();
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radii[i];
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// THREE.ShapeGeometry's default UVs are just each vertex's raw local x/y — not normalized to
// [0,1] — so for a shape spanning roughly ±radius, almost the whole surface samples a texture far
// outside [0,1] and clamps to the edge color, with a visible seam exactly where local x or y
// crosses 0. Rebuilding the UVs from the shape's own radius fixes both.
// Split from the shape's own construction — the lake/ring/valley basin walls each reuse the
// *exact same* outline as their own flat pool surface (see buildBasinWallGeometry) so there's no
// seam between the two; two independently-generated blobs (each with their own random jitter)
// would never line up.
function buildBlobGeometryFromShape(shape: THREE.Shape, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, position.getX(i) / (radius * 2) + 0.5, position.getY(i) / (radius * 2) + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

// A vertical ribbon of quads following the blob shape's own outline — from the base (local y=0,
// ground level, planted flush with the terrain around it) up to the pool's own raised surface
// (local y=+depth) — so the lake/valley read as a real raised basin with visible banks/walls, not
// a flat disc laid straight on the ground.
function buildBasinWallGeometry(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const points = shape.getPoints();
  const n = points.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const base = positions.length / 3;
    positions.push(a.x, 0, a.y, a.x, depth, a.y, b.x, 0, b.y, b.x, depth, b.y);
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A gentle S-curve, not a single kinked line: the perpendicular offset is zero at both ends
// (so it still meets the building and the shoreline exactly) and swells in the middle via a
// sine envelope, with alternating per-segment jitter so the river actually winds back and forth.
// Y eases from `startY` (the stream's own hover height near the source) down to `endY` (the
// target pool's own surface height) only over the final stretch of the path — most of the run
// stays level, then it visibly dips down into the basin right as it arrives, instead of hanging
// at a constant height in mid-air above a now-recessed lake/valley.
function buildMeanderCurve(sx: number, sz: number, ex: number, ez: number, startY: number, endY: number): THREE.CatmullRomCurve3 {
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const segments = 7;
  const controlPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const envelope = Math.sin(t * Math.PI);
    const wobble = pseudoJitter(sx + i * 11.7, sz + i * 5.3) * envelope * Math.min(len * 0.16, 3.5);
    const dipT = Math.max(0, (t - 0.65) / 0.35);
    const y = startY + (endY - startY) * dipT * dipT;
    controlPoints.push(new THREE.Vector3(sx + dx * t + nx * wobble, y, sz + dz * t + nz * wobble));
  }
  return new THREE.CatmullRomCurve3(controlPoints);
}

/** Straight-line-to-source direction decides where on the target circle's boundary a stream
 * arrives, so multiple streams converging on one pool still fan out instead of overlapping. */
function buildInflowCurve(
  targetX: number,
  targetZ: number,
  targetRadius: number,
  sx: number,
  sz: number,
  startY: number,
  endY: number,
): THREE.CatmullRomCurve3 {
  const dx = targetX - sx;
  const dz = targetZ - sz;
  const dist = Math.hypot(dx, dz) || 1;
  const edgeX = targetX - (dx / dist) * targetRadius * 0.92;
  const edgeZ = targetZ - (dz / dist) * targetRadius * 0.92;
  return buildMeanderCurve(sx, sz, edgeX, edgeZ, startY, endY);
}

// Real geometry, not a flat screen-space line — a tube has actual width in 3D, so it reads as a
// river with volume/depth instead of a wire, and (unlike Line) its radius can vary per-stream to
// reflect the amount. frustumCulled is disabled explicitly: this project hit a render-loop crash
// once from a custom geometry whose bounding sphere never got excluded from the culling check —
// cheap insurance against the same class of bug recurring.
const MIN_STREAM_RADIUS = 0.06;
const MAX_STREAM_RADIUS = 0.26;

// Direct magnitude, not rank — rank-based sizing (used for buildings/pyramid) deliberately
// guarantees every item looks different even when two values are nearly equal, which is exactly
// wrong for a pipe: ₪3,900 and ₪3,700 are basically the same amount and should look like basically
// the same pipe, not "thread" vs "river" just because they happen to be neighbors in a short list.
function radiusForWeight(weight: number): number {
  return MIN_STREAM_RADIUS + computeMagnitudeShare(weight) * (MAX_STREAM_RADIUS - MIN_STREAM_RADIUS);
}

function buildStreamTubeGeometry(curve: THREE.CatmullRomCurve3, radius: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(curve, 48, radius, 8, false);
}

// Experiment: raised clear of the ground as full round tubes (an elevated flowing channel) —
// now that every building on the map has real volume/depth, seeing whether the streams read
// better hovering above grade instead of sunk into it like a dug riverbed.
const STREAM_HOVER_HEIGHT = 0.42;
/** `terrainY` is the local ground height at the stream's own position — without it, a stream
 * would sink into or float unevenly above the hill/valley the terrain now has right under it. */
function floatYForRadius(radius: number, terrainY: number): number {
  return terrainY + STREAM_HOVER_HEIGHT + radius;
}
// the red (valley/expense-debt) streams cross paths with the blue/gold (lake/pension) streams
// often enough that whichever draws on top felt arbitrary — this guarantees red always floats
// clear above the others, at any radius combination: the thinnest valley stream (MIN radius) still
// clears the thickest water stream (MAX radius) by a comfortable margin, using the same terrainY
// each stream already samples at its own position.
const VALLEY_STREAM_LIFT = MAX_STREAM_RADIUS - MIN_STREAM_RADIUS + 0.5;
// how far ABOVE grade the lake/valley's own water surface sits, with a visible wall rising from
// the ground up to meet it — real volume/depth instead of a flat disc painted on the ground.
// Recessing it *below* grade instead was the first attempt, but the ground plane is one
// unbroken sheet with no hole cut for the basin, so a recessed surface just renders underneath
// it — invisible or z-fighting with the ground, not "in a hole". Raising the pool instead avoids
// ever needing a hole at all: the wall's own base plants exactly at grade (y=0, same as the
// ground around it), and everything the wall/water are is at or above that, never under it.
// Streams ease UP from their own hover height into this raised rim (see buildMeanderCurve's own
// dipT easing, which works the same regardless of which direction endY sits from startY).
// 0.4 was scaled for a small object seen up close — this city's own scale is enormous (lake radius
// alone reaches up to 9 units, viewed from well back and above), and a wall a fraction of a unit
// tall is completely lost at that distance. A wall proportionate to the lake's own radius is what
// actually reads as a raised reservoir from typical camera distance.
const LAKE_BASIN_DEPTH = 3;
const VALLEY_BASIN_DEPTH = 3.2;
// the pension ring gets its own, shorter raised wall too (from grade up to this height) instead of
// staying flat — a flat gold ring right next to a tall raised blue lake read as one of the two
// features just missing its own volume entirely. Deliberately lower than LAKE_BASIN_DEPTH so the
// lake's own wall continues rising *from the ring's own raised surface* up to the lake's higher
// one, like a two-tier fountain, rather than the two walls competing at the same height.
const RING_BASIN_DEPTH = 1.7;

// units of texture-space per second — fast enough to clearly read as motion, slow enough not to
// look like a strobing glitch on the short stream tubes.
const FLOW_SPEED = 0.35;
// radians per second — 0.06 (a full rotation every ~105s) turned out to be imperceptibly slow, not
// "gentle"; a full rotation every several seconds is what actually reads as a living, swirling
// surface rather than a still image. Ring and valley spin a little slower/opposite the lake so the
// three water surfaces don't all pulse in obvious lockstep.
const RIPPLE_SPEED = 0.7;

export function CityGround({ groundCenter, groundSize, water, valley }: Props) {
  const groundTexture = useMemo(() => createGroundTexture(), []);
  const flowTexture = getFlowTexture();
  const lakeTexture = getLakeTexture();
  const ringTexture = getPensionRingTexture();
  const valleyTexture = getValleyTexture();

  const [lakeX, lakeZ] = water.lakeCenter;
  const [valleyX, valleyZ] = valley.center;

  const ringShape = useMemo(() => buildBlobShape(water.outerRingRadius), [water.outerRingRadius]);
  const pensionRingGeometry = useMemo(() => buildBlobGeometryFromShape(ringShape, water.outerRingRadius), [ringShape, water.outerRingRadius]);
  const ringWallGeometry = useMemo(() => buildBasinWallGeometry(ringShape, RING_BASIN_DEPTH), [ringShape]);
  const lakeShape = useMemo(() => buildBlobShape(water.lakeRadius), [water.lakeRadius]);
  const lakeGeometry = useMemo(() => buildBlobGeometryFromShape(lakeShape, water.lakeRadius), [lakeShape, water.lakeRadius]);
  // spans only the rise *above* the ring's own already-raised surface, not the full height from
  // the ground — the wall's own position is offset up to RING_BASIN_DEPTH to start exactly there.
  const lakeWallGeometry = useMemo(() => buildBasinWallGeometry(lakeShape, LAKE_BASIN_DEPTH - RING_BASIN_DEPTH), [lakeShape]);
  const valleyShape = useMemo(() => buildBlobShape(valley.radius), [valley.radius]);
  const valleyGeometry = useMemo(() => buildBlobGeometryFromShape(valleyShape, valley.radius), [valleyShape, valley.radius]);
  const valleyWallGeometry = useMemo(() => buildBasinWallGeometry(valleyShape, VALLEY_BASIN_DEPTH), [valleyShape]);

  const lakeTerrainY = getTerrainHeight(lakeX, lakeZ);
  const valleyTerrainY = getTerrainHeight(valleyX, valleyZ);
  // both raised now — the ring sits on its own shorter wall, and the lake's own (shorter) wall
  // continues rising from the ring's own surface up to the lake's higher one (see
  // RING_BASIN_DEPTH's own comment).
  const lakeSurfaceY = lakeTerrainY + LAKE_BASIN_DEPTH + 0.05;
  const ringSurfaceY = lakeTerrainY + RING_BASIN_DEPTH + 0.05;
  const valleySurfaceY = valleyTerrainY + VALLEY_BASIN_DEPTH + 0.05;

  // liquid money pools in the inner circle; pension money pools in the ring around it. Geometry
  // now carries each point's own absolute Y directly (baked in by buildMeanderCurve's dip-to-
  // target easing), so the mesh itself renders at the origin — no separate uniform Y translation.
  const waterStreamGeometries = useMemo(
    () =>
      water.streams.map((s) => {
        const targetRadius = s.kind === 'liquid' ? water.lakeRadius : water.outerRingRadius;
        const radius = radiusForWeight(s.weight);
        const startY = floatYForRadius(radius, getTerrainHeight(s.x, s.z));
        const endY = s.kind === 'liquid' ? lakeSurfaceY : ringSurfaceY;
        const curve = buildInflowCurve(lakeX, lakeZ, targetRadius, s.x, s.z, startY, endY);
        return { kind: s.kind, hasMonthlyContribution: s.hasMonthlyContribution, geometry: buildStreamTubeGeometry(curve, radius) };
      }),
    [water.streams, lakeX, lakeZ, water.lakeRadius, water.outerRingRadius, lakeSurfaceY, ringSurfaceY],
  );

  const valleyStreamGeometries = useMemo(
    () =>
      valley.streams.map((s) => {
        const radius = radiusForWeight(s.weight);
        // VALLEY_STREAM_LIFT carried through on both ends — still needs to float clear of the
        // blue/gold water streams wherever their paths cross, on top of (not instead of) its own
        // dip into the recessed valley floor.
        const startY = floatYForRadius(radius, getTerrainHeight(s.x, s.z)) + VALLEY_STREAM_LIFT;
        const endY = valleySurfaceY + VALLEY_STREAM_LIFT;
        const curve = buildInflowCurve(valleyX, valleyZ, valley.radius, s.x, s.z, startY, endY);
        return { radius, geometry: buildStreamTubeGeometry(curve, radius) };
      }),
    [valley.streams, valleyX, valleyZ, valley.radius, valleySurfaceY],
  );

  useFrame((_, delta) => {
    // called fresh each frame rather than closing over the outer `flowTexture`/`lakeTexture`/etc.
    // locals — all four are cached module-level singletons (see their own getters above), so this
    // costs nothing beyond a lookup, and it sidesteps the react-compiler flagging mutation of a
    // captured local as unsafe.
    //
    // subtracted, not added — TubeGeometry's own u=0 sits at each stream's source (the building)
    // and u=1 at the lake/valley edge (see buildInflowCurve), and a *positive* offset shifts the
    // sampled pattern toward *lower* u, so subtracting is what actually makes the pulse travel
    // from source toward target instead of backward, upstream.
    getFlowTexture().offset.x -= delta * FLOW_SPEED;
    getLakeTexture().rotation += delta * RIPPLE_SPEED;
    getPensionRingTexture().rotation -= delta * RIPPLE_SPEED * 0.7;
    getValleyTexture().rotation += delta * RIPPLE_SPEED * 0.85;
  });

  const bounds = computeGroundBounds(groundCenter, groundSize, [
    { center: water.lakeCenter, radius: water.outerRingRadius } satisfies CircularExtent,
    { center: valley.center, radius: valley.radius } satisfies CircularExtent,
  ]);

  // Real hills/valleys, not a flat plane: subdivide and displace each vertex by the same
  // deterministic height field every other ground-level object samples, so the grass and
  // everything sitting on it agree on where "the ground" is. PlaneGeometry is authored flat in
  // its local XY plane; displacing local Z here becomes world Y once rotation-x=-PI/2 is applied,
  // and the mesh's own `position` translation has to be added back in to sample world-space
  // terrain height per vertex (matching how every other component samples it).
  const groundGeometry = useMemo(() => {
    const segments = 90;
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.depth, segments, segments);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const worldX = pos.getX(i) + bounds.center[0];
      const worldZ = -pos.getY(i) + bounds.center[1];
      pos.setZ(i, getTerrainHeight(worldX, worldZ));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [bounds.width, bounds.depth, bounds.center]);

  return (
    <group>
      <mesh geometry={groundGeometry} rotation-x={-Math.PI / 2} position={[bounds.center[0], 0, bounds.center[1]]} frustumCulled={false}>
        <meshStandardMaterial map={groundTexture} roughness={1} />
      </mesh>

      {/* the ring's own wall — from grade up to its own raised surface, following the ring's own
          outer outline. Same tinted-glass treatment as the lake wall below, in gold instead of
          blue, so the ring reads as having real volume of its own instead of being the one flat
          feature next to a raised lake. */}
      <mesh geometry={ringWallGeometry} position={[lakeX, lakeTerrainY, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial color="#7a5c1f" emissive="#c2921f" emissiveIntensity={0.3} roughness={0.4} transparent opacity={0.62} side={THREE.DoubleSide} />
      </mesh>

      <mesh geometry={pensionRingGeometry} rotation-x={-Math.PI / 2} position={[lakeX, ringSurfaceY, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={ringTexture} emissive="#c2921f" emissiveIntensity={0.3} roughness={0.15} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>

      {/* the lake's own wall continues rising from the *ring's* own raised surface (not the
          ground) up to the lake's higher one, following the lake's own outline exactly (see
          buildBasinWallGeometry) so there's no seam between the wall and the water it holds.
          Tinted the lake's own blue with a soft emissive glow and mild transparency — a flat
          near-black rock read as too dark/muddy to actually identify as part of the water
          feature; a colored, faintly translucent wall (more "glass tank" than "dirt bank") reads
          clearly as belonging to the lake it holds. */}
      <mesh geometry={lakeWallGeometry} position={[lakeX, lakeTerrainY + RING_BASIN_DEPTH, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial color="#1f5a72" emissive="#2f8fb8" emissiveIntensity={0.25} roughness={0.4} transparent opacity={0.62} side={THREE.DoubleSide} />
      </mesh>

      {waterStreamGeometries.map(({ kind, hasMonthlyContribution, geometry }, i) => (
        <mesh key={i} geometry={geometry} frustumCulled={false}>
          {/* the animated flow pulse is reserved for money actually being topped up every month —
              a stream with no map just renders as a calm, smooth, unpulsing tube, reading as "this
              pool is being fed" vs. "this is a static balance just sitting there" (see
              StreamSource.hasMonthlyContribution's own comment in domain/water.ts). */}
          <meshStandardMaterial
            color={WATER_STREAM_COLOR[kind]}
            emissive={WATER_STREAM_COLOR[kind]}
            emissiveIntensity={hasMonthlyContribution ? WATER_STREAM_EMISSIVE_INTENSITY[kind] : WATER_STREAM_EMISSIVE_INTENSITY[kind] * 0.55}
            map={hasMonthlyContribution ? flowTexture : null}
            emissiveMap={hasMonthlyContribution ? flowTexture : null}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
      ))}

      <mesh geometry={lakeGeometry} rotation-x={-Math.PI / 2} position={[lakeX, lakeSurfaceY, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={lakeTexture} emissive="#155a82" emissiveIntensity={0.28} roughness={0.12} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* same tinted-glass treatment as the lake wall, in the valley's own ember red instead of
          blue. */}
      <mesh geometry={valleyWallGeometry} position={[valleyX, valleyTerrainY, valleyZ]} frustumCulled={false}>
        <meshStandardMaterial color="#7a2e28" emissive="#b84a4a" emissiveIntensity={0.3} roughness={0.4} transparent opacity={0.62} side={THREE.DoubleSide} />
      </mesh>

      {valleyStreamGeometries.map(({ geometry }, i) => (
        <mesh key={i} geometry={geometry} frustumCulled={false}>
          <meshStandardMaterial
            color="#b84a4a"
            emissive="#b84a4a"
            emissiveIntensity={0.32}
            map={flowTexture}
            emissiveMap={flowTexture}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
      ))}

      <mesh geometry={valleyGeometry} rotation-x={-Math.PI / 2} position={[valleyX, valleySurfaceY, valleyZ]} frustumCulled={false}>
        <meshStandardMaterial map={valleyTexture} emissive="#b84a4a" emissiveIntensity={0.42} roughness={0.3} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
