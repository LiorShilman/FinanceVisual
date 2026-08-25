import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  onOpen: () => void;
}

const STONE_COLOR = '#1c1e24';
const COIN_COLOR = '#e8cf8a';
const MOTE_COUNT = 6;
const FLICKER_SPEED = 4.5;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A carved giving pillar, not a hanging lantern — a stone offering bowl at the base holds a few
 * coins, and a steady stream of small glowing motes rises from that bowl up the pillar's length to
 * a flame at its top. The coins-becoming-light read is deliberate: "what you gave is lifted into
 * something greater", not just an ornamental column with a pretty glow, so it stays legible as
 * *donation* specifically rather than an object that could belong to any other category.
 */
export function CityGivingPillarMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const moteRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flameRef = useRef<THREE.Group>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const bowlRadius = Math.max(0.65, Math.min(1.15, footprint * 0.9));
  const bowlHeight = 0.24;
  const pillarRadiusBottom = Math.max(0.26, Math.min(0.46, footprint * 0.32));
  const pillarRadiusTop = pillarRadiusBottom * 0.75;
  const pillarHeight = Math.max(2.0, Math.min(4.4, height * 0.75));
  const flameRadius = Math.max(0.34, Math.min(0.75, footprint * 0.58));

  const pillarBaseY = bowlHeight;
  const pillarTopY = pillarBaseY + pillarHeight;
  const flameBaseY = pillarTopY;

  // deterministic per-position seed (not Math.random — impure during render, and would reshuffle
  // every mote's timing on each re-render anyway).
  const seed = x * 12.9898 + z * 78.233;
  const motePhases = useMemo(() => Array.from({ length: MOTE_COUNT }, (_, i) => hash(seed + i * 3.7)), [seed]);
  const flamePhase = hash(seed) * Math.PI * 2;
  const coins = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => {
        const h1 = hash(seed + i * 5.1 + 20);
        const h2 = hash(seed + i * 6.3 + 30);
        const angle = h1 * Math.PI * 2;
        const r = bowlRadius * 0.35 * h2;
        return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, rot: h1 * Math.PI };
      }),
    [seed, bowlRadius],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const m = moteRefs.current[i];
      if (!m) continue;
      const progress = (t * 0.35 + motePhases[i]) % 1;
      const wobble = Math.sin(t * 1.6 + motePhases[i] * 6) * bowlRadius * 0.25 * (1 - progress);
      m.position.set(wobble, pillarBaseY + progress * (flameBaseY - pillarBaseY), 0);
      const fade = Math.sin(progress * Math.PI);
      m.scale.setScalar(0.4 + 0.6 * fade);
    }
    if (flameRef.current) {
      const flicker = 1 + Math.sin(t * FLICKER_SPEED + flamePhase) * 0.1 + Math.sin(t * FLICKER_SPEED * 2.3 + flamePhase) * 0.05;
      flameRef.current.scale.set(1, flicker, 1);
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* the offering bowl, with a couple of coins resting in it */}
      <mesh position={[0, bowlHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[bowlRadius, bowlRadius * 1.12, bowlHeight, 10]} />
        <meshStandardMaterial color={STONE_COLOR} emissive={color} emissiveIntensity={0.4} roughness={0.7} flatShading />
      </mesh>
      {coins.map((c, i) => (
        <mesh key={i} position={[c.x, bowlHeight + 0.02, c.z]} rotation={[Math.PI / 2, 0, c.rot]} frustumCulled={false}>
          <cylinderGeometry args={[bowlRadius * 0.16, bowlRadius * 0.16, 0.03, 10]} />
          <meshStandardMaterial color={COIN_COLOR} emissive={COIN_COLOR} emissiveIntensity={0.5} roughness={0.35} metalness={0.4} />
        </mesh>
      ))}

      {/* the pillar itself */}
      <mesh position={[0, pillarBaseY + pillarHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[pillarRadiusTop, pillarRadiusBottom, pillarHeight, 8]} />
        <meshStandardMaterial color={STONE_COLOR} emissive={color} emissiveIntensity={0.35} roughness={0.65} flatShading />
      </mesh>
      <mesh position={[0, pillarBaseY + pillarHeight / 2, 0]} scale={[1.03, 1.005, 1.03]} frustumCulled={false}>
        <cylinderGeometry args={[pillarRadiusTop, pillarRadiusBottom, pillarHeight, 8]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.3} depthWrite={false} />
      </mesh>

      {/* the coins-becoming-light, rising from the bowl up the pillar's length */}
      {motePhases.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            moteRefs.current[i] = el;
          }}
          frustumCulled={false}
        >
          <sphereGeometry args={[bowlRadius * 0.14, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} roughness={0.3} />
        </mesh>
      ))}

      {/* the flame the coins become at the top — two stacked, flickering cones */}
      <group ref={flameRef} position={[0, flameBaseY, 0]}>
        <mesh position={[0, flameRadius * 0.55, 0]} frustumCulled={false} onClick={handleClick}>
          <coneGeometry args={[flameRadius, flameRadius * 1.5, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} roughness={0.35} flatShading />
        </mesh>
        <mesh position={[0, flameRadius * 0.95, 0]} frustumCulled={false} onClick={handleClick}>
          <coneGeometry args={[flameRadius * 0.55, flameRadius * 1.1, 8]} />
          <meshStandardMaterial color="#fff0e0" emissive="#fff0e0" emissiveIntensity={1.3} roughness={0.3} flatShading />
        </mesh>
        <pointLight position={[0, flameRadius * 0.8, 0]} color={color} intensity={0.85} distance={4} decay={2} />
      </group>

      <Billboard position={[0, flameBaseY + flameRadius * 2 + 0.5, 0]}>
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
    </group>
  );
}
