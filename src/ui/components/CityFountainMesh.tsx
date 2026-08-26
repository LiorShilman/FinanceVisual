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
  labelScale?: number;
  onOpen: () => void;
}

const WATER_COLOR = '#4ab8d8';
const DROP_COUNT = 6;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * "Source" entities (misc income origins) get a small fountain instead of a flat grey box — money
 * literally springs from it, a droplet arc looping around a central pillar and landing back in the
 * basin (same per-item useFrame-driven arc technique as CityIncomeFaucet's own drops). Stone basin
 * uses the same near-black-base-plus-emissive-tint, low-poly-faceted recipe as the insurance
 * shield/trophy so it reads as carved stone under any lighting instead of a flat solid disc.
 */
export function CityFountainMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Props) {
  const dropRefs = useRef<(THREE.Mesh | null)[]>([]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const basinRadius = Math.max(1.5, Math.min(2.9, footprint * 2.1));
  const basinHeight = Math.max(0.7, Math.min(1.3, height * 0.24));
  const pillarHeight = Math.max(1.5, Math.min(3.4, height * 0.8));

  // deterministic per-position phase (not Math.random — impure during render, and would
  // reshuffle every drop's timing on each re-render anyway).
  const seed = x * 12.9898 + z * 78.233;
  const phases = useMemo(() => Array.from({ length: DROP_COUNT }, (_, i) => hash(seed + i * 3.3)), [seed]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < DROP_COUNT; i++) {
      const mesh = dropRefs.current[i];
      if (!mesh) continue;
      const angle = (i / DROP_COUNT) * Math.PI * 2;
      const progress = (t * 0.55 + phases[i]) % 1;
      const arc = Math.sin(progress * Math.PI);
      const radius = basinRadius * 0.6 * progress;
      const y = basinHeight + pillarHeight * 0.35 + pillarHeight * 1.1 * arc;
      mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      mesh.scale.setScalar(0.5 + 0.5 * arc);
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, basinHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[basinRadius, basinRadius * 1.08, basinHeight, 10]} />
        <meshStandardMaterial color="#1c1e24" emissive={color} emissiveIntensity={0.55} roughness={0.7} flatShading />
      </mesh>
      {/* a bright wireframe rim on the basin's own facet edges — same trick the shield/trophy
          use so the facets read even without a texture. */}
      <mesh position={[0, basinHeight / 2, 0]} scale={[1.03, 1.02, 1.03]} frustumCulled={false}>
        <cylinderGeometry args={[basinRadius, basinRadius * 1.08, basinHeight, 10]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, basinHeight + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[basinRadius * 0.88, 20]} />
        <meshStandardMaterial
          color={WATER_COLOR}
          emissive={WATER_COLOR}
          emissiveIntensity={0.6}
          transparent
          opacity={0.8}
          roughness={0.15}
          metalness={0.2}
        />
      </mesh>
      <mesh position={[0, basinHeight + pillarHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[basinRadius * 0.13, basinRadius * 0.19, pillarHeight, 8]} />
        <meshStandardMaterial color="#1c1e24" emissive={color} emissiveIntensity={0.55} roughness={0.7} flatShading />
      </mesh>
      <pointLight position={[0, basinHeight + pillarHeight * 0.6, 0]} color={WATER_COLOR} intensity={0.6} distance={4} decay={2} />

      {Array.from({ length: DROP_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            dropRefs.current[i] = el;
          }}
          frustumCulled={false}
        >
          <sphereGeometry args={[basinRadius * 0.065, 8, 8]} />
          <meshStandardMaterial color={WATER_COLOR} emissive={WATER_COLOR} emissiveIntensity={0.9} roughness={0.2} />
        </mesh>
      ))}

      <Billboard position={[0, basinHeight + pillarHeight + 0.9, 0]}>
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
    </group>
  );
}
