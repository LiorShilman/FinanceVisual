import { useMemo } from 'react';
import * as THREE from 'three';
import { computeGroundBounds, type CircularExtent } from '../../domain/cityGrid';
import { computeMagnitudeShare } from '../../domain/sizing';
import { getTerrainHeight } from '../../domain/terrain';
import type { ValleyFeature } from '../../domain/valley';
import type { WaterFeature } from '../../domain/water';

interface Props {
  groundCenter: [number, number];
  groundSize: number;
  water: WaterFeature;
  valley: ValleyFeature;
}

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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
function buildBlobGeometry(radius: number, points = 32): THREE.BufferGeometry {
  const shape = buildBlobShape(radius, points);
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, position.getX(i) / (radius * 2) + 0.5, position.getY(i) / (radius * 2) + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

// A gentle S-curve, not a single kinked line: the perpendicular offset is zero at both ends
// (so it still meets the building and the shoreline exactly) and swells in the middle via a
// sine envelope, with alternating per-segment jitter so the river actually winds back and forth.
function buildMeanderCurve(sx: number, sz: number, ex: number, ez: number): THREE.CatmullRomCurve3 {
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
    controlPoints.push(new THREE.Vector3(sx + dx * t + nx * wobble, 0.02, sz + dz * t + nz * wobble));
  }
  return new THREE.CatmullRomCurve3(controlPoints);
}

/** Straight-line-to-source direction decides where on the target circle's boundary a stream
 * arrives, so multiple streams converging on one pool still fan out instead of overlapping. */
function buildInflowCurve(targetX: number, targetZ: number, targetRadius: number, sx: number, sz: number): THREE.CatmullRomCurve3 {
  const dx = targetX - sx;
  const dz = targetZ - sz;
  const dist = Math.hypot(dx, dz) || 1;
  const edgeX = targetX - (dx / dist) * targetRadius * 0.92;
  const edgeZ = targetZ - (dz / dist) * targetRadius * 0.92;
  return buildMeanderCurve(sx, sz, edgeX, edgeZ);
}

// Real geometry, not a flat screen-space line — a tube has actual width in 3D, so it reads as a
// river with volume/depth instead of a wire, and (unlike Line) its radius can vary per-stream to
// reflect the amount. frustumCulled is disabled explicitly: this project hit a render-loop crash
// once from a custom geometry whose bounding sphere never got excluded from the culling check —
// cheap insurance against the same class of bug recurring.
const MIN_STREAM_RADIUS = 0.09;
const MAX_STREAM_RADIUS = 0.42;

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

// Sunk below grade and flattened (via the mesh's own scale-y/position-y, not the geometry
// itself) so streams read as water sitting inside a dug channel rather than a pipe laid on top of
// the lawn — no separate dark "bank" layer (that read as solid black, swallowing the water color
// entirely), just the same bright water tube, lower and flatter.
//
// The exposed sliver's height is a fixed *fraction* of each stream's own radius, not a flat
// offset — a flat offset made every stream (thin or thick) show the exact same absolute sliver,
// which erased the width-reflects-amount cue the streams exist to show. Scaling the sink with
// radius keeps the visible cap's width proportional to the full tube width (near the top of an
// ellipse a small height reveals most of its width), so a thick stream still visibly reads as
// thicker than a thin one, while most of every tube's bulk still sits below the grass line.
const WATER_SQUASH = 0.4;
const GROUND_Y_OFFSET = -0.02;
const EXPOSED_RADIUS_FRACTION = 0.16;
/** `terrainY` is the local ground height at the stream's own position — without it, a stream
 * would sink into or float above the hill/valley the terrain now has right under it. */
function sinkYForRadius(radius: number, terrainY: number): number {
  return terrainY + GROUND_Y_OFFSET + radius * (EXPOSED_RADIUS_FRACTION - WATER_SQUASH);
}

export function CityGround({ groundCenter, groundSize, water, valley }: Props) {
  const groundTexture = useMemo(() => createGroundTexture(), []);
  const lakeTexture = useMemo(
    () =>
      createWaterTexture(
        [
          [0, '#a9defc'],
          [0.35, '#3fb0f7'],
          [0.7, '#1467c9'],
          [1, '#082a5c'],
        ],
        'rgba(255,255,255,0.55)',
      ),
    [],
  );
  // the ring's own *center* sits underneath the inner lake mesh and is never actually seen — only
  // the outer band (near UV=1) is visible — so unlike the lake, the bright tone has to sit at the
  // outer stop or the ring reads as a dark, unrecognizable rim instead of lavender.
  const ringTexture = useMemo(
    () =>
      createWaterTexture(
        [
          [0, '#3a2d70'],
          [0.5, '#7457d6'],
          [0.78, '#ab8ef2'],
          [1, '#ddc9ff'],
        ],
        'rgba(255,255,255,0.5)',
      ),
    [],
  );
  // a canyon, not a pool — glowing embers rather than gentle ripples, but still bright enough at
  // the edges (most of the visible area, since area grows with r²) to read as alive, not a black
  // hole. Kept in the same red family as the expense buildings' own health-risk color (#e05a5a),
  // not orange/amber — that hue is already claimed by every warning-status savings/investment/
  // pension building, and an orange valley next to them read as ambiguous.
  const valleyTexture = useMemo(
    () =>
      createWaterTexture(
        [
          [0, '#ff8a7a'],
          [0.35, '#e05a5a'],
          [0.7, '#a02f38'],
          [1, '#4a1218'],
        ],
        'rgba(255,140,130,0.4)',
      ),
    [],
  );

  const [lakeX, lakeZ] = water.lakeCenter;
  const [valleyX, valleyZ] = valley.center;

  const pensionRingGeometry = useMemo(() => buildBlobGeometry(water.outerRingRadius), [water.outerRingRadius]);
  const lakeGeometry = useMemo(() => buildBlobGeometry(water.lakeRadius), [water.lakeRadius]);
  const valleyGeometry = useMemo(() => buildBlobGeometry(valley.radius), [valley.radius]);

  // liquid money pools in the inner circle; pension money pools in the ring around it.
  const waterStreamGeometries = useMemo(
    () =>
      water.streams.map((s) => {
        const targetRadius = s.kind === 'liquid' ? water.lakeRadius : water.outerRingRadius;
        const curve = buildInflowCurve(lakeX, lakeZ, targetRadius, s.x, s.z);
        const radius = radiusForWeight(s.weight);
        return { kind: s.kind, radius, terrainY: getTerrainHeight(s.x, s.z), geometry: buildStreamTubeGeometry(curve, radius) };
      }),
    [water.streams, lakeX, lakeZ, water.lakeRadius, water.outerRingRadius],
  );

  const valleyStreamGeometries = useMemo(
    () =>
      valley.streams.map((s) => {
        const curve = buildInflowCurve(valleyX, valleyZ, valley.radius, s.x, s.z);
        const radius = radiusForWeight(s.weight);
        return { radius, terrainY: getTerrainHeight(s.x, s.z), geometry: buildStreamTubeGeometry(curve, radius) };
      }),
    [valley.streams, valleyX, valleyZ, valley.radius],
  );

  const lakeTerrainY = getTerrainHeight(lakeX, lakeZ);
  const valleyTerrainY = getTerrainHeight(valleyX, valleyZ);

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

      <mesh geometry={pensionRingGeometry} rotation-x={-Math.PI / 2} position={[lakeX, lakeTerrainY + 0.012, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={ringTexture} emissive="#7457d6" emissiveIntensity={0.45} roughness={0.15} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>

      {waterStreamGeometries.map(({ kind, radius, terrainY, geometry }, i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={[0, sinkYForRadius(radius, terrainY), 0]}
          scale={[1, WATER_SQUASH, 1]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            color={kind === 'pension' ? '#a397e8' : '#5aa8e0'}
            emissive={kind === 'pension' ? '#a397e8' : '#5aa8e0'}
            emissiveIntensity={0.5}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
      ))}

      <mesh geometry={lakeGeometry} rotation-x={-Math.PI / 2} position={[lakeX, lakeTerrainY + 0.018, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={lakeTexture} emissive="#1467c9" emissiveIntensity={0.4} roughness={0.12} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>

      {valleyStreamGeometries.map(({ radius, terrainY, geometry }, i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={[0, sinkYForRadius(radius, terrainY), 0]}
          scale={[1, WATER_SQUASH, 1]}
          frustumCulled={false}
        >
          <meshStandardMaterial color="#e05a5a" emissive="#e05a5a" emissiveIntensity={0.5} roughness={0.25} metalness={0.1} />
        </mesh>
      ))}

      <mesh geometry={valleyGeometry} rotation-x={-Math.PI / 2} position={[valleyX, valleyTerrainY + 0.014, valleyZ]} frustumCulled={false}>
        <meshStandardMaterial map={valleyTexture} emissive="#e05a5a" emissiveIntensity={0.65} roughness={0.3} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
