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

const FRAME_COLOR = '#3a2f24';
const GRAIN_COUNT = 7;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A regular (non-mortgage) debt gets an hourglass instead of a plain office tower — interest is
 * time pressure, not just a number, so a running sand timer reads truer than another building.
 * The glass is genuinely transparent (not a flat tinted solid), faceted with the same bright
 * wireframe-rim trick as the shield/trophy/fountain, and tinted with the entity's own health
 * color — blue while manageable, sliding to risk-red exactly when the debt actually gets
 * dangerous, so the timer's own color carries real information, not just decoration.
 */
export function CityHourglassMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const grainRefs = useRef<(THREE.Mesh | null)[]>([]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const bulbRadius = Math.max(0.55, Math.min(1.3, footprint * 0.95));
  const neckRadius = bulbRadius * 0.1;
  const bulbHeight = Math.max(0.9, Math.min(2.3, height * 0.42));
  const neckGap = bulbHeight * 0.08;
  const frameCapRadius = bulbRadius * 1.18;
  const frameCapHeight = 0.12;
  const postRadius = bulbRadius * 0.07;

  const bottomCapY = frameCapHeight / 2;
  const bottomBulbY = frameCapHeight + bulbHeight / 2;
  const neckY = frameCapHeight + bulbHeight + neckGap / 2;
  const topBulbY = frameCapHeight + bulbHeight + neckGap + bulbHeight / 2;
  const topCapY = frameCapHeight + bulbHeight + neckGap + bulbHeight + frameCapHeight / 2;
  const totalTopY = topCapY + frameCapHeight / 2;

  // deterministic per-position phase (not Math.random — impure during render, and would
  // reshuffle every grain's timing on each re-render anyway).
  const seed = x * 12.9898 + z * 78.233;
  const grainPhases = useMemo(() => Array.from({ length: GRAIN_COUNT }, (_, i) => hash(seed + i * 3.7)), [seed]);
  const posts = useMemo(
    () => Array.from({ length: 4 }, (_, i) => (i / 4) * Math.PI * 2 + Math.PI / 4),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < GRAIN_COUNT; i++) {
      const g = grainRefs.current[i];
      if (!g) continue;
      const progress = (t * 0.5 + grainPhases[i]) % 1;
      const y = topBulbY + bulbHeight * 0.3 - progress * (topBulbY + bulbHeight * 0.3 - (bottomBulbY - bulbHeight * 0.15));
      // pulled toward the center axis right around the neck, so grains visibly funnel through
      // the narrow waist instead of clipping through the glass.
      const neckPull = Math.max(0, 1 - Math.abs(y - neckY) / (bulbHeight * 0.35));
      const angle = hash(seed + i * 5.1) * Math.PI * 2;
      const radius = bulbRadius * 0.3 * (1 - neckPull * 0.85);
      g.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  });

  const glassMaterial = (
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={0.4} roughness={0.15} flatShading />
  );
  const frameMaterial = <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} metalness={0.35} flatShading />;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, bottomCapY, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[frameCapRadius, frameCapRadius, frameCapHeight, 8]} />
        {frameMaterial}
      </mesh>
      <mesh position={[0, topCapY, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[frameCapRadius, frameCapRadius, frameCapHeight, 8]} />
        {frameMaterial}
      </mesh>
      {posts.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * frameCapRadius * 0.92, totalTopY / 2, Math.sin(a) * frameCapRadius * 0.92]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[postRadius, postRadius, totalTopY, 6]} />
          {frameMaterial}
        </mesh>
      ))}

      {/* bottom bulb — narrow at the neck (top), wide at the base */}
      <mesh position={[0, bottomBulbY, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[neckRadius, bulbRadius, bulbHeight, 8, 1, true]} />
        {glassMaterial}
      </mesh>
      <mesh position={[0, bottomBulbY, 0]} scale={[1.03, 1, 1.03]} frustumCulled={false}>
        <cylinderGeometry args={[neckRadius, bulbRadius, bulbHeight, 8, 1, true]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* the sand that's already fallen — a small static mound resting in the bottom bulb */}
      <mesh position={[0, frameCapHeight + bulbHeight * 0.22, 0]} frustumCulled={false}>
        <coneGeometry args={[bulbRadius * 0.55, bulbHeight * 0.32, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.6} />
      </mesh>

      {/* top bulb — wide at the base (top), narrow at the neck (bottom) */}
      <mesh position={[0, topBulbY, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[bulbRadius, neckRadius, bulbHeight, 8, 1, true]} />
        {glassMaterial}
      </mesh>
      <mesh position={[0, topBulbY, 0]} scale={[1.03, 1, 1.03]} frustumCulled={false}>
        <cylinderGeometry args={[bulbRadius, neckRadius, bulbHeight, 8, 1, true]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {grainPhases.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            grainRefs.current[i] = el;
          }}
          frustumCulled={false}
        >
          <sphereGeometry args={[bulbRadius * 0.06, 6, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.4} />
        </mesh>
      ))}
      <pointLight position={[0, neckY, 0]} color={color} intensity={0.5} distance={3} decay={2} />

      <Billboard position={[0, totalTopY + 0.6, 0]}>
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
