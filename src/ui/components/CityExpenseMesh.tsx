import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { ExpenseType } from '../../domain/entity';
import { computeTiers, getFacadeTexture, getRoofTexture } from './cityTowerShared';
import { CityThickOutline } from './CityThickOutline';

const OUTLINE_COLOR = '#0a0c11';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  expenseType: ExpenseType;
  labelScale?: number;
  onOpen: () => void;
}

// Deterministic per-position jitter (same sine-hash pattern used elsewhere in the city) instead of
// Math.random() — oxlint's react(purity) rule flags Math.random() in a render path, and identical
// input should always resolve to the same phase anyway.
function hash01(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function labelBlock(name: string, amount: string, y: number, labelScale = 1) {
  return (
    <Billboard position={[0, y, 0]}>
      {amount !== '' && (
        <Text
          position={[0, 1, 0]}
          fontSize={0.58 * labelScale}
          color="#ffd166"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.022}
          outlineColor="#7a4a00"
          outlineBlur={0.03}
          fontWeight="bold"
          frustumCulled={false}
        >
          {amount}
        </Text>
      )}
      <Text
        fontSize={0.72 * labelScale}
        color="#f1f3f8"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#0a0c11"
        fontWeight="bold"
        frustumCulled={false}
      >
        {name}
      </Text>
    </Billboard>
  );
}

/**
 * A single pulsing crystal core — 'other' has no real-world building shape to lean on the way
 * housing/food/transport do, so instead of another tower it gets a plain faceted shape with a
 * slow breathing pulse. (An earlier version orbited a storm of shard debris around the core —
 * fine for one of these, but with several 'other' expenses in view at once it read as visual
 * overload across the whole expense district, so the shards are gone; the pulse alone is still
 * enough to read as "alive" and distinct from a static building.) Stays in the shared expense-red
 * family so it's still legible as "expense" at a glance.
 */
function ChaosExpenseMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Omit<Props, 'expenseType'>) {
  const coreRef = useRef<THREE.Group>(null);
  // deterministic per-position phase (not Math.random — impure during render, and would reshuffle
  // on every re-render anyway) so multiple instances don't all pulse in lockstep.
  const phase = hash01(x * 0.37 + z * 0.53) * Math.PI * 2;

  const coreRadius = Math.max(0.35, Math.min(height * 0.28, footprint * 0.65));
  const floatY = coreRadius + Math.max(0.6, height * 0.25);

  const coreGeometry = useMemo(() => new THREE.IcosahedronGeometry(coreRadius, 0), [coreRadius]);
  const coreEdges = useMemo(() => new THREE.EdgesGeometry(coreGeometry), [coreGeometry]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 1.6 + phase) * 0.09;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.rotation.y = t * 0.4;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* the pulse/spin drives this wrapping group's own transform now (mesh + outline together),
          not the mesh alone — an outline sibling that didn't share the same transform would drift
          out of sync with the core it's supposed to trace. */}
      <group ref={coreRef} position={[0, floatY, 0]}>
        <mesh geometry={coreGeometry} frustumCulled={false} onClick={handleClick}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.45} metalness={0.15} />
        </mesh>
        <CityThickOutline geometry={coreEdges} color={OUTLINE_COLOR} linewidth={1.6} />
      </group>
      <pointLight position={[0, floatY, 0]} color={color} intensity={0.5} distance={4} decay={2} />
      {labelBlock(name, amount, floatY + coreRadius + 0.7, labelScale)}
    </group>
  );
}

/**
 * A shopping cart standing on its own — a tapered open-top basket (cylinderGeometry with 4 radial
 * segments, the same "primitive as polygon" trick the housing roof uses), two wheels, and a
 * handle. Sized off the full entity weight (like every other standalone city mesh), in the shared
 * expense-red family.
 */
function FoodExpenseMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Omit<Props, 'expenseType'>) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const cartScale = Math.max(0.7, Math.min(height * 0.5, footprint * 1.3));
  const basketH = cartScale * 1.1;
  const basketRTop = cartScale * 0.75;
  const basketRBottom = cartScale * 0.5;
  const wheelR = cartScale * 0.26;
  const basketY = wheelR * 1.8 + basketH / 2;

  const basketGeometry = useMemo(
    () => new THREE.CylinderGeometry(basketRTop, basketRBottom, basketH, 4, 1, true),
    [basketRTop, basketRBottom, basketH],
  );
  const basketEdges = useMemo(() => new THREE.EdgesGeometry(basketGeometry), [basketGeometry]);

  return (
    <group position={[x, 0, z]} rotation={[0, -0.3, 0]} onClick={handleClick}>
      <mesh geometry={basketGeometry} position={[0, basketY, 0]} rotation={[0.22, 0, 0]} frustumCulled={false}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <CityThickOutline geometry={basketEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, basketY, 0]} rotation={[0.22, 0, 0]} />
      {[-basketRBottom * 0.75, basketRBottom * 0.75].map((xOff) => (
        <mesh key={xOff} position={[xOff, wheelR, basketRBottom * 0.25]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
          <torusGeometry args={[wheelR, wheelR * 0.4, 8, 12]} />
          <meshStandardMaterial color="#2a2e38" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, basketY + basketH / 2 + cartScale * 0.35, -basketRTop * 0.5]} rotation={[Math.PI / 2.1, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[cartScale * 0.42, cartScale * 0.08, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#2a2e38" metalness={0.4} roughness={0.5} />
      </mesh>
      {labelBlock(name, amount, basketY + basketH / 2 + cartScale * 0.9 + 0.7, labelScale)}
    </group>
  );
}

/**
 * A single standing wheel — 'transport' doesn't need anything more literal than that. Sized off
 * the full entity weight, in the shared expense-red family, with a dark hub and crossbar spokes
 * for a bit of mechanical detail against the flat red rubber.
 */
function TransportExpenseMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Omit<Props, 'expenseType'>) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const wheelR = Math.max(0.6, Math.min(height * 0.45, footprint * 1.1));
  const tubeR = wheelR * 0.32;

  const wheelGeometry = useMemo(() => new THREE.TorusGeometry(wheelR, tubeR, 10, 28), [wheelR, tubeR]);
  const wheelEdges = useMemo(() => new THREE.EdgesGeometry(wheelGeometry), [wheelGeometry]);

  return (
    <group position={[x, 0, z]} onClick={handleClick}>
      <mesh geometry={wheelGeometry} position={[0, wheelR, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.55} metalness={0.1} />
      </mesh>
      <CityThickOutline geometry={wheelEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, wheelR, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh position={[0, wheelR, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <cylinderGeometry args={[tubeR * 0.85, tubeR * 0.85, tubeR * 0.5, 12]} />
        <meshStandardMaterial color="#2a2e38" metalness={0.5} roughness={0.4} />
      </mesh>
      {[0, Math.PI / 2].map((rot) => (
        <mesh key={rot} position={[0, wheelR, 0]} rotation={[Math.PI / 2, 0, rot]} frustumCulled={false}>
          <boxGeometry args={[wheelR * 1.8, tubeR * 0.28, tubeR * 0.28]} />
          <meshStandardMaterial color="#2a2e38" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {labelBlock(name, amount, wheelR * 2 + 0.7, labelScale)}
    </group>
  );
}

/**
 * Only 'housing' keeps the shared tiered-tower massing (with a pyramid roof standing in for the
 * flat cap) — it's the one sub-type where "a building" is the correct shape. 'food', 'transport',
 * and 'other' are all fully standalone objects — see FoodExpenseMesh, TransportExpenseMesh,
 * ChaosExpenseMesh.
 */
export function CityExpenseMesh({ x, z, height, footprint, color, name, amount, expenseType, labelScale = 1, onOpen }: Props) {
  const facadeTexture = useMemo(() => getFacadeTexture(), []);
  const roofTexture = useMemo(() => getRoofTexture(), []);
  const tiers = useMemo(() => computeTiers(height, footprint), [height, footprint]);
  // these three only ever matter for the 'housing' sub-type below, but every useMemo call still
  // has to run unconditionally on every render regardless of expenseType (React's own rules-of-
  // hooks) — computed here, before the early returns for the other three sub-types, rather than
  // down next to where they're actually used.
  const topFootprint = tiers[tiers.length - 1].fp;
  const roofRadius = topFootprint * 0.72;
  const roofPeakHeight = Math.max(0.9, roofRadius * 1.3);
  const tierGeometries = useMemo(
    () =>
      tiers.map((tier) => {
        const geometry = new THREE.BoxGeometry(tier.fp, tier.h, tier.fp);
        return { geometry, edges: new THREE.EdgesGeometry(geometry) };
      }),
    [tiers],
  );
  const roofGeometry = useMemo(() => new THREE.ConeGeometry(roofRadius, roofPeakHeight, 4), [roofRadius, roofPeakHeight]);
  const roofEdges = useMemo(() => new THREE.EdgesGeometry(roofGeometry), [roofGeometry]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  if (expenseType === 'other') {
    return (
      <ChaosExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} labelScale={labelScale} onOpen={onOpen} />
    );
  }
  if (expenseType === 'food') {
    return (
      <FoodExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} labelScale={labelScale} onOpen={onOpen} />
    );
  }
  if (expenseType === 'transport') {
    return (
      <TransportExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} labelScale={labelScale} onOpen={onOpen} />
    );
  }

  // housing
  const tierTops = tiers.reduce<number[]>((acc, tier) => [...acc, (acc[acc.length - 1] ?? 0) + tier.h], []);
  const ledgeHeight = 0.05;
  const tierMeshes = tiers.map((tier, i) => {
    const y = tierTops[i] - tier.h / 2;
    return (
      <group key={i}>
        <mesh geometry={tierGeometries[i].geometry} position={[0, y, 0]} frustumCulled={false} onClick={handleClick}>
          <meshStandardMaterial
            color="#4a5162"
            map={facadeTexture}
            emissive={color}
            emissiveMap={facadeTexture}
            emissiveIntensity={0.95}
            roughness={0.55}
          />
        </mesh>
        <CityThickOutline geometry={tierGeometries[i].edges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, y, 0]} />
        {i < tiers.length - 1 && (
          <mesh position={[0, tierTops[i] + ledgeHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <boxGeometry args={[tier.fp * 1.06, ledgeHeight, tier.fp * 1.06]} />
            <meshStandardMaterial color="#171a22" roughness={0.8} />
          </mesh>
        )}
      </group>
    );
  });

  const roofHeight = Math.max(0.08, height * 0.015);
  // A slight eave overhang past the top tier's own wall plus a small sunk-in overlap at the base —
  // a roof that starts exactly where the wall ends, with no visible seam or gap, reads as part of
  // the building instead of a separate shape resting on top of it.
  const overlap = roofHeight * 3;
  const roofY = height + roofPeakHeight / 2 - overlap;

  return (
    <group position={[x, 0, z]}>
      {tierMeshes}
      <CityThickOutline geometry={roofEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, roofY, 0]} rotation={[0, Math.PI / 4, 0]} />
      <mesh geometry={roofGeometry} position={[0, roofY, 0]} rotation={[0, Math.PI / 4, 0]} frustumCulled={false} onClick={handleClick}>
        {/* the roof used to be a flat, hardcoded terracotta regardless of health status — the
            single most visually prominent part of a housing expense, disconnected from whether
            it's a "need" (red) or a "want" (a similar terracotta), which is exactly why that
            distinction barely read at all. It now tracks `color` like every other part of the
            mesh. */}
        <meshStandardMaterial color={color} map={roofTexture} emissive={color} emissiveMap={roofTexture} emissiveIntensity={0.35} roughness={0.75} />
      </mesh>
      {labelBlock(name, amount, height + roofHeight + 0.85, labelScale)}
    </group>
  );
}
