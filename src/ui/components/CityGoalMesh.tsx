import { useRef } from 'react';
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
  /** currentAmount / targetAmount, clamped to [0, 1] by the caller. */
  progress: number;
  onOpen: () => void;
}

const GOLD = '#ffd166';

/**
 * A goal reads as literally under construction — a wireframe shell at the full target size, with
 * a solid mass filling it from the ground up as it gets funded. At 0% it's an empty scaffold; at
 * 100% the solid box exactly fills the shell — which on its own reads as "just a plain building
 * now", the same as any other fully-built one, losing exactly the moment worth celebrating. A
 * completed goal gets a slowly spinning golden ring overhead instead, so reaching 100% stays
 * visibly different from simply being a funded goal at 99%.
 */
export function CityGoalMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, progress, onOpen }: Props) {
  const ringRef = useRef<THREE.Mesh>(null);
  const isComplete = progress >= 1;
  // deterministic per-position phase (not Math.random — impure during render) so multiple
  // completed goals don't spin in lockstep.
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);
  const ringRadius = Math.max(0.5, footprint * 0.7);
  const ringY = height + 0.5;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const solidHeight = Math.max(0.02, height * progress);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.elapsedTime;
    ringRef.current.rotation.z = t * 0.6 + phase;
    ringRef.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.8 + phase) * 0.15;
  });

  return (
    <group position={[x, 0, z]}>
      {/* the finished shape, as a wireframe shell — always full size regardless of progress */}
      <mesh position={[0, height / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[footprint, height, footprint]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.55} />
      </mesh>
      {/* the funded portion, solid, growing from the ground up */}
      {progress > 0 && (
        <mesh position={[0, solidHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
          <boxGeometry args={[footprint * 0.94, solidHeight, footprint * 0.94]} />
          <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.8} roughness={0.5} />
        </mesh>
      )}

      {isComplete && (
        <>
          <mesh ref={ringRef} position={[0, ringY, 0]} rotation={[Math.PI / 2.4, 0, 0]} frustumCulled={false} onClick={handleClick}>
            <torusGeometry args={[ringRadius, ringRadius * 0.08, 10, 28]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.9} roughness={0.3} metalness={0.4} />
          </mesh>
          <pointLight position={[0, ringY, 0]} color={GOLD} intensity={0.7} distance={4} decay={2} />
        </>
      )}

      <Billboard position={[0, height + (isComplete ? 1.3 : 0.7), 0]}>
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
