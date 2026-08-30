import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../domain/terrain';
import { HEALTH_COLORS } from '../../domain/health';

interface Props {
  /** Same ground-bounds rectangle CityGround itself is built from (computeGroundBounds) — the
   * border traces this rectangle's own perimeter, just outside the grass edge. */
  center: [number, number];
  width: number;
  depth: number;
  /** 0..1+, signed: the real share of income actually flowing to savings/giving (budgetSplit's own
   * `savings / income`) when the household isn't overspending, or the negative overspend share
   * (`-(committed - income) / income`) when it is (the same condition budgetSplit's own
   * `overCommitted` flags). A *ratio*, not a ₪ amount — a family earning 8,000 and saving 20% should
   * read exactly as "fast" as one earning 25,000 saving the same 20%. */
  savingsOrDeficitRatio: number;
}

// texture-space units/second at the slowest (near-zero flow) and fastest (a strong savings rate or
// bad overspend) ends.
const MIN_SPEED = 0.15;
const MAX_SPEED = 1.1;
// a savings/deficit *share of income* at or beyond this reaches MAX_SPEED — a little above the
// classic 50/30/20 rule's own 20% savings target (see domain/budgetSplit.ts), so actually hitting
// that standard target already reads as a strong, satisfying current.
const FULL_SPEED_RATIO = 0.25;
const HOVER_HEIGHT = 0.3;
const RADIUS = 0.55;
const MARGIN = 4; // how far outside the ground's own edge the border sits
// points per edge — enough that a CatmullRom curve's own natural corner-rounding stays tight/subtle
// rather than visibly bulging past the actual corner.
const POINTS_PER_EDGE = 14;

// A real, deliberately *separate* texture instance from cityFlowTexture.ts's own shared singleton
// (used by every water/valley stream and the cash-runway tube): that one's speed is fixed and
// shared so every one of those consumers pulses in lockstep — mutating its `.offset` here too, at
// this border's own independent (ratio-driven) speed, would fight that shared animation state and
// visibly corrupt it for every other consumer sharing the same texture object.
let sharedTexture: THREE.CanvasTexture | null = null;
function getIndependentFlowTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
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
  texture.repeat.set(24, 1);
  sharedTexture = texture;
  return texture;
}

/**
 * A gently circulating border around the whole map — a closed loop, not a path threading through
 * the city's own buildings. Two earlier attempts (a full-ground diagonal-projected overlay, then a
 * single point-to-point stream cutting across the grass toward the lake) both read badly in
 * practice (reported 2026-08-30/31 — disjointed jumping bars, then still "not good"); a perimeter
 * loop sidesteps both problems entirely: no path-finding through clutter, no risk of an odd-looking
 * diagonal crossing the whole board. Circulates faster and brighter green with a real savings rate,
 * reverses direction and turns red when spending already outpaces income.
 */
export function CityCashFlowCurrent({ center, width, depth, savingsOrDeficitRatio }: Props) {
  const texture = getIndependentFlowTexture();

  const geometry = useMemo(() => {
    const halfW = width / 2 + MARGIN;
    const halfD = depth / 2 + MARGIN;
    const [cx, cz] = center;
    const corners: [number, number][] = [
      [cx - halfW, cz - halfD],
      [cx + halfW, cz - halfD],
      [cx + halfW, cz + halfD],
      [cx - halfW, cz + halfD],
    ];

    const points: THREE.Vector3[] = [];
    for (let i = 0; i < corners.length; i++) {
      const [x0, z0] = corners[i];
      const [x1, z1] = corners[(i + 1) % corners.length];
      for (let p = 0; p < POINTS_PER_EDGE; p++) {
        const t = p / POINTS_PER_EDGE;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        points.push(new THREE.Vector3(x, getTerrainHeight(x, z) + HOVER_HEIGHT, z));
      }
    }
    const curve = new THREE.CatmullRomCurve3(points, true);
    return new THREE.TubeGeometry(curve, points.length, RADIUS, 10, true);
  }, [center, width, depth]);

  const direction = savingsOrDeficitRatio >= 0 ? 1 : -1;
  const magnitude = Math.min(1, Math.abs(savingsOrDeficitRatio) / FULL_SPEED_RATIO);
  const speed = (MIN_SPEED + magnitude * (MAX_SPEED - MIN_SPEED)) * direction;
  const color = savingsOrDeficitRatio >= 0 ? HEALTH_COLORS.good : HEALTH_COLORS.risk;

  useFrame((_, delta) => {
    texture.offset.x -= delta * speed;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        color={color}
        emissive={color}
        emissiveIntensity={0.6}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  );
}
