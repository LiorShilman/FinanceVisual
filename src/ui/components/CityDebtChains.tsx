import { useMemo } from 'react';
import * as THREE from 'three';
import type { DebtLinkPath } from '../../domain/debtLinks';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  /** Ground position of every debt building — each gets its own ball-and-chain regardless of
   * whether it's linked to anything, since the burden is real even unlinked. */
  debtPositions: [number, number][];
  /** Debt entities linked to another entity (e.g. a mortgage to the home it's financing) — an
   * extra chain connects the two buildings directly, on top of each debt's own ball-and-chain. */
  linkPaths: DebtLinkPath[];
}

// "Realistic iron" kept losing to the ground/shadow regardless of shade (light steel wasn't
// loved, dark gunmetal went invisible, pure black with only specular highlights was worse) —
// giving up on realism and reusing debt's own established blue instead: same color as the
// building, so the chain reads as "this debt's own burden" and is guaranteed visible since that
// blue was already chosen specifically to stay legible against this scene.
const CHAIN_COLOR = '#4a7fc9';
const BALL_COLOR = '#1f3a63';
const RING_RADIUS = 0.17;
const RING_TUBE = 0.06;
const LINK_SPACING = 0.34;

/** Small alternating-orientation rings along a straight segment — reads as an actual chain
 * (links alternately turned 90°) rather than a smooth wire. */
function ChainLinks({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const length = from.distanceTo(to);
  const count = Math.max(1, Math.round(length / LINK_SPACING));
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  // any vector not parallel to dir gives a stable perpendicular basis for orienting each ring
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(dir, up).normalize();
  const quatA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const quatB = quatA.clone().multiply(new THREE.Quaternion().setFromAxisAngle(normal, Math.PI / 2));

  const links = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const point = new THREE.Vector3().lerpVectors(from, to, t);
    const quat = i % 2 === 0 ? quatA : quatB;
    return { point, quat };
  });

  return (
    <>
      {links.map(({ point, quat }, i) => (
        <mesh key={i} position={point} quaternion={quat} frustumCulled={false}>
          <torusGeometry args={[RING_RADIUS, RING_TUBE, 6, 12]} />
          <meshStandardMaterial color={CHAIN_COLOR} emissive={CHAIN_COLOR} emissiveIntensity={0.4} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

// Well clear of true grade now — the first two passes kept the ball too low and too close to the
// building itself, small enough and dark enough to disappear against the ground/building shadow.
// Hanging it higher, bigger, and further out gives it clean air on every side to actually read.
const BALL_RADIUS = 0.42;
const BALL_CENTER_Y = 0.55;
// offset out from the building's own center — centered exactly on it, the ball and chain sat
// *inside* the opaque tower volume and never showed at all; this hangs it clear beside the building.
const SIDE_OFFSET = 1.1;
const CHAIN_TOP_Y = 1.6;

function BallAndChain({ x, z }: { x: number; z: number }) {
  // sampled at the building's own position — the ground under it, whether hill or dip, not a
  // flat 0 the terrain no longer actually has.
  const terrainY = getTerrainHeight(x, z);
  const anchorX = x + SIDE_OFFSET;
  const top = useMemo(() => new THREE.Vector3(anchorX, terrainY + CHAIN_TOP_Y, z), [anchorX, z, terrainY]);
  const bottom = useMemo(
    () => new THREE.Vector3(anchorX, terrainY + BALL_CENTER_Y + BALL_RADIUS, z),
    [anchorX, z, terrainY],
  );
  return (
    <group>
      <ChainLinks from={top} to={bottom} />
      <mesh position={[anchorX, terrainY + BALL_CENTER_Y, z]} frustumCulled={false}>
        <sphereGeometry args={[BALL_RADIUS, 16, 16]} />
        <meshStandardMaterial color={BALL_COLOR} emissive={BALL_COLOR} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

const LINK_Y_OFFSET = 0.4;

function LinkChain({ path }: { path: DebtLinkPath }) {
  const [fx, fz] = path.from;
  const [tx, tz] = path.to;
  // each point of the elbow samples its own terrain height — the two ends can sit at genuinely
  // different ground heights now, so a single flat y would visibly cut through a hill or hover
  // over a dip partway along the path.
  const start = useMemo(() => new THREE.Vector3(fx, LINK_Y_OFFSET + getTerrainHeight(fx, fz), fz), [fx, fz]);
  const corner = useMemo(() => new THREE.Vector3(tx, LINK_Y_OFFSET + getTerrainHeight(tx, fz), fz), [tx, fz]);
  const end = useMemo(() => new THREE.Vector3(tx, LINK_Y_OFFSET + getTerrainHeight(tx, tz), tz), [tx, tz]);
  const aligned = Math.abs(fx - tx) < 0.01 || Math.abs(fz - tz) < 0.01;

  return aligned ? (
    <ChainLinks from={start} to={end} />
  ) : (
    <>
      <ChainLinks from={start} to={corner} />
      <ChainLinks from={corner} to={end} />
    </>
  );
}

/** Debt drags at every building it's attached to — a ball-and-chain hanging off each debt
 * building's base, plus (when the debt is linked to another entity, like a mortgage to its home)
 * a second chain running between the two, so the burden a real debt puts on a specific asset is
 * visible, not just implied. */
export function CityDebtChains({ debtPositions, linkPaths }: Props) {
  return (
    <group>
      {debtPositions.map(([x, z], i) => (
        <BallAndChain key={i} x={x} z={z} />
      ))}
      {linkPaths.map((path, i) => (
        <LinkChain key={i} path={path} />
      ))}
    </group>
  );
}
