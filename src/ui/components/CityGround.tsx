import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { computeGroundBounds, type CircularExtent } from '../../domain/cityGrid';
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
function buildMeanderPoints(sx: number, sz: number, ex: number, ez: number): THREE.Vector3[] {
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
  return new THREE.CatmullRomCurve3(controlPoints).getPoints(40);
}

/** Straight-line-to-source direction decides where on the target circle's boundary a stream
 * arrives, so multiple streams converging on one pool still fan out instead of overlapping. */
function buildInflowPoints(targetX: number, targetZ: number, targetRadius: number, sx: number, sz: number): THREE.Vector3[] {
  const dx = targetX - sx;
  const dz = targetZ - sz;
  const dist = Math.hypot(dx, dz) || 1;
  const edgeX = targetX - (dx / dist) * targetRadius * 0.92;
  const edgeZ = targetZ - (dz / dist) * targetRadius * 0.92;
  return buildMeanderPoints(sx, sz, edgeX, edgeZ);
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
  const waterStreamPaths = useMemo(
    () =>
      water.streams.map((s) => {
        const targetRadius = s.kind === 'liquid' ? water.lakeRadius : water.outerRingRadius;
        return { kind: s.kind, points: buildInflowPoints(lakeX, lakeZ, targetRadius, s.x, s.z) };
      }),
    [water.streams, lakeX, lakeZ, water.lakeRadius, water.outerRingRadius],
  );
  const valleyStreamPaths = useMemo(
    () => valley.streams.map((s) => buildInflowPoints(valleyX, valleyZ, valley.radius, s.x, s.z)),
    [valley.streams, valleyX, valleyZ, valley.radius],
  );

  const bounds = computeGroundBounds(groundCenter, groundSize, [
    { center: water.lakeCenter, radius: water.outerRingRadius } satisfies CircularExtent,
    { center: valley.center, radius: valley.radius } satisfies CircularExtent,
  ]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[bounds.center[0], -0.02, bounds.center[1]]} frustumCulled={false}>
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <meshStandardMaterial map={groundTexture} roughness={1} />
      </mesh>

      <mesh geometry={pensionRingGeometry} rotation-x={-Math.PI / 2} position={[lakeX, 0.012, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={ringTexture} emissive="#7457d6" emissiveIntensity={0.45} roughness={0.15} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>

      {waterStreamPaths.map(({ kind, points }, i) => (
        <Line
          key={i}
          points={points}
          color={kind === 'pension' ? '#a397e8' : '#5aa8e0'}
          lineWidth={2.5}
          transparent
          opacity={0.75}
          frustumCulled={false}
        />
      ))}

      <mesh geometry={lakeGeometry} rotation-x={-Math.PI / 2} position={[lakeX, 0.018, lakeZ]} frustumCulled={false}>
        <meshStandardMaterial map={lakeTexture} emissive="#1467c9" emissiveIntensity={0.4} roughness={0.12} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>

      {valleyStreamPaths.map((points, i) => (
        <Line key={i} points={points} color="#e05a5a" lineWidth={2.5} transparent opacity={0.75} frustumCulled={false} />
      ))}

      <mesh geometry={valleyGeometry} rotation-x={-Math.PI / 2} position={[valleyX, 0.014, valleyZ]} frustumCulled={false}>
        <meshStandardMaterial map={valleyTexture} emissive="#e05a5a" emissiveIntensity={0.65} roughness={0.3} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
