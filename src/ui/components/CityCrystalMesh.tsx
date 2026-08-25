import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { computeCrownMouthRadius, computeCrystalLabelY, computeCrystalTrunkHeight } from './cityGrowthGeometry';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  /** Suppressed for a top-3 medaled entity — CityMedalBadge owns its whole name/amount label
   * stack instead (with the trophy sitting between the two), so this mesh's own label would
   * otherwise duplicate it right next to the crown mouth. */
  hideLabel?: boolean;
  onOpen: () => void;
}

const BREATHE_SPEED = 1.3;
const BREATHE_AMPLITUDE = 0.08;
const BARK_COLOR = '#241a2c';
const TRAP_COLOR = '#2c1f38';
const BRANCH_COUNT = 3;
const TEETH_PER_MOUTH = 6;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Crypto/forex investments read as "tempting but dangerous" — a carnivorous tree instead of the
 * gem-topped one this replaced. Each mouth is a dark, toothed funnel (a pitcher-plant trap, not a
 * pair of hinged jaws — far simpler geometry, same "open toothy trap" read) with a glowing lure
 * hidden inside as bait. Bark is near-black/violet, not the mineral grey the crystal tree used, so
 * the whole silhouette reads as sinister at a glance, not just its ornaments.
 */
export function CityCrystalMesh({ x, z, height, footprint, color, name, amount, hideLabel, onOpen }: Props) {
  const lureRefs = useRef<(THREE.Mesh | null)[]>([]);
  const mouthRefs = useRef<(THREE.Group | null)[]>([]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const trunkHeight = computeCrystalTrunkHeight(height);
  const trunkRadiusBottom = Math.max(0.09, Math.min(0.2, footprint * 0.12));
  const crownMouthRadius = computeCrownMouthRadius(height, footprint);

  // deterministic per-position seed (not Math.random — impure during render, and would reshuffle
  // on every re-render anyway) so a building's branch layout and breathing phase stay stable.
  const seed = x * 12.9898 + z * 78.233;
  const trunkTilt = (hash(seed + 0.7) - 0.5) * 0.22;

  const branches = useMemo(
    () =>
      Array.from({ length: BRANCH_COUNT }, (_, i) => {
        const h1 = hash(seed + i * 4.1);
        const h2 = hash(seed + i * 7.3 + 5);
        return {
          yaw: (i / BRANCH_COUNT) * Math.PI * 2 + h1 * 0.7,
          tilt: 0.6 + h2 * 0.35,
          len: trunkHeight * (0.6 + h2 * 0.4),
          phase: h1 * Math.PI * 2,
          mouthRadius: crownMouthRadius * (0.42 + h1 * 0.16),
          // each mouth leans on its own, independent of the branch's own tilt — without this
          // every mouth (a radially symmetric funnel) looked identical regardless of which way
          // its branch pointed, since spinning a cone around its own axis doesn't change how it
          // reads. A real lean tips the opening toward the camera enough to actually glimpse the
          // glowing lure inside instead of just a dark throat.
          mouthTiltX: (hash(seed + i * 11.3 + 9) - 0.5) * 0.9,
          mouthTiltZ: (hash(seed + i * 13.7 + 9) - 0.5) * 0.9,
        };
      }),
    [seed, trunkHeight, crownMouthRadius],
  );
  const crownPhase = hash(seed) * Math.PI * 2;
  const crownMouthTiltX = (hash(seed + 2.2) - 0.5) * 0.9;
  const crownMouthTiltZ = (hash(seed + 3.3) - 0.5) * 0.9;
  const teethAngles = useMemo(() => Array.from({ length: TEETH_PER_MOUTH }, (_, i) => (i / TEETH_PER_MOUTH) * Math.PI * 2), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < mouthRefs.current.length; i++) {
      const mouth = mouthRefs.current[i];
      const lure = lureRefs.current[i];
      const phase = i === 0 ? crownPhase : branches[i - 1].phase;
      const breathe = 1 + Math.sin(t * BREATHE_SPEED + phase) * BREATHE_AMPLITUDE;
      if (mouth) mouth.scale.set(1, breathe, 1);
      if (lure) lure.scale.setScalar(1 + Math.sin(t * BREATHE_SPEED * 1.4 + phase) * BREATHE_AMPLITUDE * 1.6);
    }
  });

  // a toothed, funnel-shaped trap with a glowing lure resting in its throat — index 0 is always
  // the crown mouth (registers its refs first), branch mouths follow in branch order. Rotated
  // around its own base (this wrapper's own origin, not the funnel's center) so it leans like a
  // real stem bending, instead of pivoting around its own middle.
  const renderMouth = (radius: number, refIndex: number, tiltX: number, tiltZ: number) => {
    const funnelHeight = radius * 1.15;
    const throatRadius = radius * 0.3;
    return (
      <group rotation={[tiltX, 0, tiltZ]}>
        <group
          ref={(el) => {
            mouthRefs.current[refIndex] = el;
          }}
          position={[0, funnelHeight / 2, 0]}
        >
          <mesh frustumCulled={false} onClick={handleClick}>
            <cylinderGeometry args={[radius, throatRadius, funnelHeight, 9, 1, true]} />
            <meshStandardMaterial color={TRAP_COLOR} roughness={0.65} side={THREE.DoubleSide} />
          </mesh>
          {teethAngles.map((a, i) => (
            <mesh
              key={i}
              position={[Math.cos(a) * radius * 0.92, funnelHeight / 2 - radius * 0.08, Math.sin(a) * radius * 0.92]}
              rotation={[Math.PI, 0, 0]}
              frustumCulled={false}
            >
              <coneGeometry args={[radius * 0.09, radius * 0.32, 5]} />
              <meshStandardMaterial color="#e7e1d8" roughness={0.4} />
            </mesh>
          ))}
          <mesh
            ref={(el) => {
              lureRefs.current[refIndex] = el;
            }}
            position={[0, -funnelHeight * 0.22, 0]}
            frustumCulled={false}
            onClick={handleClick}
          >
            <icosahedronGeometry args={[throatRadius * 1.4, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} roughness={0.3} />
          </mesh>
          <pointLight position={[0, -funnelHeight * 0.1, 0]} color={color} intensity={0.6} distance={3} decay={2} />
        </group>
      </group>
    );
  };

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, trunkHeight / 2, 0]} rotation={[trunkTilt, 0, trunkTilt * 0.6]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[trunkRadiusBottom * 0.55, trunkRadiusBottom, trunkHeight, 7]} />
        <meshStandardMaterial color={BARK_COLOR} roughness={0.85} />
      </mesh>

      {branches.map((b, i) => (
        <group key={i} position={[0, trunkHeight * 0.75, 0]} rotation={[b.tilt, b.yaw, 0]}>
          <mesh position={[0, b.len / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <cylinderGeometry args={[0.02, 0.045, b.len, 5]} />
            <meshStandardMaterial color={BARK_COLOR} roughness={0.85} />
          </mesh>
          <group position={[0, b.len, 0]}>{renderMouth(b.mouthRadius, i + 1, b.mouthTiltX, b.mouthTiltZ)}</group>
        </group>
      ))}

      <group position={[0, trunkHeight, 0]}>{renderMouth(crownMouthRadius, 0, crownMouthTiltX, crownMouthTiltZ)}</group>

      {!hideLabel && (
        <Billboard position={[0, computeCrystalLabelY(height, footprint), 0]}>
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
      )}
    </group>
  );
}
