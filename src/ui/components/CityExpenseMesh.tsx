import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { ExpenseType } from '../../domain/entity';
import { computeTiers, getFacadeTexture, getRoofTexture } from './cityTowerShared';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  expenseType: ExpenseType;
  onOpen: () => void;
}

const SHARD_COUNT = 5;

// Deterministic per-index jitter (same sine-hash pattern used elsewhere in the city) instead of
// Math.random() — oxlint's react(purity) rule flags Math.random() in a render path, and identical
// input should always place the same shard the same way anyway.
function hash01(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function labelBlock(name: string, amount: string, y: number) {
  return (
    <Billboard position={[0, y, 0]}>
      {amount !== '' && (
        <Text
          position={[0, 0.62, 0]}
          fontSize={0.42}
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
        fontSize={0.46}
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
 * A small orbiting storm of red shards around a pulsing core — 'other' has no real-world building
 * shape to lean on the way housing/food/transport do, so instead of another tower it gets motion:
 * money going in unclassified directions, read literally as debris flying off in every direction.
 * Stays in the shared expense-red family so it's still legible as "expense" at a glance.
 */
function ChaosExpenseMesh({ x, z, height, footprint, color, name, amount, onOpen }: Omit<Props, 'expenseType'>) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shardRefs = useRef<(THREE.Group | null)[]>([]);
  // deterministic per-position phase (not Math.random — impure during render, and would reshuffle
  // on every re-render anyway) so multiple instances don't all spin in lockstep.
  const phase = hash01(x * 0.37 + z * 0.53) * Math.PI * 2;

  const coreRadius = Math.max(0.35, Math.min(height * 0.28, footprint * 0.65));
  const floatY = coreRadius + Math.max(0.6, height * 0.25);

  const shards = Array.from({ length: SHARD_COUNT }, (_, i) => {
    const seed = i + 1;
    return {
      orbitRadius: coreRadius * (1.7 + hash01(seed * 3.1) * 1.0),
      orbitSpeed: 0.35 + hash01(seed * 5.7) * 0.45,
      yOffset: (hash01(seed * 7.3) - 0.5) * coreRadius * 1.6,
      phaseOffset: hash01(seed * 9.1) * Math.PI * 2,
      size: coreRadius * (0.28 + hash01(seed * 2.3) * 0.18),
    };
  });

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
    shards.forEach((s, i) => {
      const g = shardRefs.current[i];
      if (!g) return;
      const angle = t * s.orbitSpeed + s.phaseOffset;
      g.position.set(Math.cos(angle) * s.orbitRadius, floatY + s.yOffset + Math.sin(t * 0.9 + s.phaseOffset) * 0.15, Math.sin(angle) * s.orbitRadius);
      g.rotation.set(t * 1.3 + s.phaseOffset, t * 0.9, t * 0.6);
    });
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={coreRef} position={[0, floatY, 0]} frustumCulled={false} onClick={handleClick}>
        <icosahedronGeometry args={[coreRadius, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.45} metalness={0.15} />
      </mesh>
      <pointLight position={[0, floatY, 0]} color={color} intensity={0.5} distance={4} decay={2} />
      {shards.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            shardRefs.current[i] = el;
          }}
        >
          <mesh frustumCulled={false} onClick={handleClick}>
            <coneGeometry args={[s.size, s.size * 1.7, 3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {labelBlock(name, amount, floatY + coreRadius + 0.7)}
    </group>
  );
}

/**
 * A shopping cart standing on its own — a tapered open-top basket (cylinderGeometry with 4 radial
 * segments, the same "primitive as polygon" trick the housing roof uses), two wheels, and a
 * handle. Sized off the full entity weight (like every other standalone city mesh), in the shared
 * expense-red family.
 */
function FoodExpenseMesh({ x, z, height, footprint, color, name, amount, onOpen }: Omit<Props, 'expenseType'>) {
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

  return (
    <group position={[x, 0, z]} rotation={[0, -0.3, 0]} onClick={handleClick}>
      <mesh position={[0, basketY, 0]} rotation={[0.22, 0, 0]} frustumCulled={false}>
        <cylinderGeometry args={[basketRTop, basketRBottom, basketH, 4, 1, true]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
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
      {labelBlock(name, amount, basketY + basketH / 2 + cartScale * 0.9 + 0.7)}
    </group>
  );
}

/**
 * A single standing wheel — 'transport' doesn't need anything more literal than that. Sized off
 * the full entity weight, in the shared expense-red family, with a dark hub and crossbar spokes
 * for a bit of mechanical detail against the flat red rubber.
 */
function TransportExpenseMesh({ x, z, height, footprint, color, name, amount, onOpen }: Omit<Props, 'expenseType'>) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const wheelR = Math.max(0.6, Math.min(height * 0.45, footprint * 1.1));
  const tubeR = wheelR * 0.32;

  return (
    <group position={[x, 0, z]} onClick={handleClick}>
      <mesh position={[0, wheelR, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[wheelR, tubeR, 10, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.55} metalness={0.1} />
      </mesh>
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
      {labelBlock(name, amount, wheelR * 2 + 0.7)}
    </group>
  );
}

/**
 * Only 'housing' keeps the shared tiered-tower massing (with a pyramid roof standing in for the
 * flat cap) — it's the one sub-type where "a building" is the correct shape. 'food', 'transport',
 * and 'other' are all fully standalone objects — see FoodExpenseMesh, TransportExpenseMesh,
 * ChaosExpenseMesh.
 */
export function CityExpenseMesh({ x, z, height, footprint, color, name, amount, expenseType, onOpen }: Props) {
  const facadeTexture = useMemo(() => getFacadeTexture(), []);
  const roofTexture = useMemo(() => getRoofTexture(), []);
  const tiers = useMemo(() => computeTiers(height, footprint), [height, footprint]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  if (expenseType === 'other') {
    return <ChaosExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} onOpen={onOpen} />;
  }
  if (expenseType === 'food') {
    return <FoodExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} onOpen={onOpen} />;
  }
  if (expenseType === 'transport') {
    return <TransportExpenseMesh x={x} z={z} height={height} footprint={footprint} color={color} name={name} amount={amount} onOpen={onOpen} />;
  }

  // housing
  const tierTops = tiers.reduce<number[]>((acc, tier) => [...acc, (acc[acc.length - 1] ?? 0) + tier.h], []);
  const ledgeHeight = 0.05;
  const tierMeshes = tiers.map((tier, i) => {
    const y = tierTops[i] - tier.h / 2;
    return (
      <group key={i}>
        <mesh position={[0, y, 0]} frustumCulled={false} onClick={handleClick}>
          <boxGeometry args={[tier.fp, tier.h, tier.fp]} />
          <meshStandardMaterial
            color="#4a5162"
            map={facadeTexture}
            emissive={color}
            emissiveMap={facadeTexture}
            emissiveIntensity={0.95}
            roughness={0.55}
          />
        </mesh>
        {i < tiers.length - 1 && (
          <mesh position={[0, tierTops[i] + ledgeHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <boxGeometry args={[tier.fp * 1.06, ledgeHeight, tier.fp * 1.06]} />
            <meshStandardMaterial color="#171a22" roughness={0.8} />
          </mesh>
        )}
      </group>
    );
  });

  const topFootprint = tiers[tiers.length - 1].fp;
  const roofHeight = Math.max(0.08, height * 0.015);
  // A slight eave overhang past the top tier's own wall plus a small sunk-in overlap at the base —
  // a roof that starts exactly where the wall ends, with no visible seam or gap, reads as part of
  // the building instead of a separate shape resting on top of it.
  const roofRadius = topFootprint * 0.72;
  const roofPeakHeight = Math.max(0.9, roofRadius * 1.3);
  const overlap = roofHeight * 3;

  return (
    <group position={[x, 0, z]}>
      {tierMeshes}
      <mesh position={[0, height + roofPeakHeight / 2 - overlap, 0]} rotation={[0, Math.PI / 4, 0]} frustumCulled={false} onClick={handleClick}>
        <coneGeometry args={[roofRadius, roofPeakHeight, 4]} />
        <meshStandardMaterial
          color="#d97a45"
          map={roofTexture}
          emissive="#d97a45"
          emissiveMap={roofTexture}
          emissiveIntensity={0.35}
          roughness={0.75}
        />
      </mesh>
      {labelBlock(name, amount, height + roofHeight + 0.85)}
    </group>
  );
}
