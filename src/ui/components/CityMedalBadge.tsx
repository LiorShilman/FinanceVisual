import { useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

interface Props {
  x: number;
  z: number;
  y: number;
  rank: 1 | 2 | 3;
}

const RANK_STYLE: Record<1 | 2 | 3, { metal: string; label: string }> = {
  1: { metal: '#e8b923', label: '1' },
  2: { metal: '#c3c9d4', label: '2' },
  3: { metal: '#c17a3f', label: '3' },
};

const ROTATE_SPEED = 0.35;
const BOB_SPEED = 1.6;
const BOB_AMPLITUDE = 0.1;

/**
 * A small floating trophy above each of the top-3 largest growth holdings (savings/investment/
 * pension/studyFund, ranked together by amount regardless of which of the four they are) — gold/
 * silver/bronze by rank. A flat Billboard coin always presents the exact same perfect-circle
 * silhouette to the camera, which read as "a painted dot" rather than an object — this is a real
 * cup/stem/base shape (same near-black-base-plus-emissive-tint recipe as the insurance shield)
 * that slowly turns in place, so its outline genuinely changes with the viewing angle. Only the
 * rank number stays on its own Billboard, since text still has to face the camera to be legible.
 */
export function CityMedalBadge({ x, z, y, rank }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const style = RANK_STYLE[rank];
  // deterministic per-position phase (not Math.random — impure during render) so multiple
  // trophies don't bob/spin in lockstep.
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.position.y = y + Math.sin(t * BOB_SPEED + phase) * BOB_AMPLITUDE;
      groupRef.current.rotation.y = t * ROTATE_SPEED + phase;
    }
  });

  const baseRadius = 0.62;
  const baseHeight = 0.17;
  const stemHeight = 0.36;
  const stemRadius = 0.1;
  const cupHeight = 0.9;
  const cupTopRadius = 0.76;
  const cupBottomRadius = 0.3;
  const cupY = baseHeight + stemHeight + cupHeight / 2;
  const material = (intensity: number) => (
    <meshStandardMaterial color="#020203" emissive={style.metal} emissiveIntensity={intensity} metalness={0.4} roughness={0.4} flatShading />
  );

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <pointLight color={style.metal} intensity={0.75} distance={4} decay={2} />

      <mesh position={[0, baseHeight / 2, 0]} frustumCulled={false}>
        <cylinderGeometry args={[baseRadius, baseRadius * 1.15, baseHeight, 8]} />
        {material(0.5)}
      </mesh>
      <mesh position={[0, baseHeight + stemHeight / 2, 0]} frustumCulled={false}>
        <cylinderGeometry args={[stemRadius, stemRadius * 1.5, stemHeight, 8]} />
        {material(0.5)}
      </mesh>
      <mesh position={[0, cupY, 0]} frustumCulled={false}>
        <cylinderGeometry args={[cupTopRadius, cupBottomRadius, cupHeight, 8]} />
        {material(0.85)}
      </mesh>
      {/* a bright wireframe rim on the cup's own facet edges — same trick the insurance shield
          uses so the facets read even without a texture. */}
      <mesh position={[0, cupY, 0]} scale={[1.04, 1.02, 1.04]} frustumCulled={false}>
        <cylinderGeometry args={[cupTopRadius, cupBottomRadius, cupHeight, 8]} />
        <meshBasicMaterial color={style.metal} wireframe transparent opacity={0.45} />
      </mesh>

      <Billboard position={[0, baseHeight + stemHeight + cupHeight + 0.55, 0]}>
        <Text
          fontSize={0.85}
          color={style.metal}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.02}
          outlineColor="#241a08"
          frustumCulled={false}
        >
          {style.label}
        </Text>
      </Billboard>
    </group>
  );
}
