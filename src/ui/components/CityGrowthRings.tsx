import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { GrowthProjectionPoint } from '../../domain/compoundInterest';

interface Props {
  x: number;
  z: number;
  // just above the entity's own tree/crystal label — the rings float above everything the mesh
  // already renders, not overlapping it.
  baseY: number;
  points: GrowthProjectionPoint[];
  color: string;
  // '' hides amount labels entirely (respects the board's hideAmounts privacy toggle) without the
  // caller needing to know why.
  formatAmount: (value: number) => string;
}

const MIN_RADIUS = 0.9;
const MAX_RADIUS = 3.4;
const ROTATE_SPEED = 0.12;
// every year gets a ring, but a label on every single one would overlap into noise — only these
// (plus the final year, always) get a floating amount, spaced around the disc so they don't stack.
const LABEL_INTERVAL = 5;

/**
 * A literal tree-rings cross-section, floating flat above the projected entity's own mesh — one
 * ring per projected year, growing outward exactly the way a real trunk's rings do, except here
 * the width between rings encodes real balance growth (a fast-growth year reads as a wide ring)
 * rather than a real tree's actual (basically illegible at this scale) growth-rate signal.
 */
export function CityGrowthRings({ x, z, baseY, points, color, formatAmount }: Props) {
  const groupRef = useRef<THREE.Group>(null);

  const finalBalance = points.at(-1)?.balance ?? 0;

  const rings = useMemo(
    () =>
      points.slice(1).map((p, i) => {
        const share = finalBalance > 0 ? p.balance / finalBalance : 0;
        return {
          year: p.year,
          balance: p.balance,
          radius: MIN_RADIUS + share * (MAX_RADIUS - MIN_RADIUS),
          // alternating faint/bright rings, the way real growth rings show earlywood/latewood
          // banding — purely decorative, but it's what keeps a stack of plain circles reading as
          // "tree rings" instead of "a target".
          bright: i % 2 === 0,
        };
      }),
    [points, finalBalance],
  );

  const labels = useMemo(
    () =>
      rings.filter((r, i) => r.year % LABEL_INTERVAL === 0 || i === rings.length - 1).map((r, i, arr) => ({
        ...r,
        // spread labels around the disc by their own order, not by year, so consecutive labels
        // (which sit at similar radii) don't land in the same direction and overlap.
        angle: (i / arr.length) * Math.PI * 2,
      })),
    [rings],
  );

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += ROTATE_SPEED * delta;
  });

  if (rings.length === 0) return null;

  return (
    <group position={[x, baseY, z]}>
      {/* groupRef spins around world-up — the inner group only tilts the rings flat within that
          already-spinning frame, so the disc turns like a turntable instead of tumbling. */}
      <group ref={groupRef}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {rings.map((r) => (
            <mesh key={r.year} frustumCulled={false}>
              <torusGeometry args={[r.radius, r.bright ? 0.035 : 0.02, 6, 40]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={r.bright ? 0.55 : 0.25}
                roughness={0.5}
                metalness={0.15}
              />
            </mesh>
          ))}
          {/* a faint filled disc under the rings so the cross-section reads as a solid surface,
              not just floating wire loops. */}
          <mesh position={[0, -0.01, 0]} frustumCulled={false}>
            <circleGeometry args={[MAX_RADIUS, 48]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} transparent opacity={0.14} roughness={0.9} />
          </mesh>
        </group>

        {labels.map((l) => (
          <Billboard key={l.year} position={[Math.cos(l.angle) * (l.radius + 0.5), 0.15, Math.sin(l.angle) * (l.radius + 0.5)]}>
            <Text fontSize={0.32} color="#ffd166" anchorX="center" anchorY="bottom" outlineWidth={0.018} outlineColor="#7a4a00" fontWeight="bold" frustumCulled={false}>
              {formatAmount(l.balance)}
            </Text>
            <Text position={[0, -0.36, 0]} fontSize={0.22} color="#c9d3e6" anchorX="center" anchorY="top" outlineWidth={0.014} outlineColor="#0a0c11" frustumCulled={false}>
              {`שנה ${l.year}`}
            </Text>
          </Billboard>
        ))}
      </group>
    </group>
  );
}
