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
  onOpen: () => void;
}

/**
 * Donations get a floating paper lantern instead of a wrapped gift box — "the light you send
 * forward" reads better than a wrapped package, and it isn't a flat solid shape: a low-poly
 * icosahedron (the same faceted-panel trick the shield/trophy/fountain use) with a bright
 * wireframe rim, hung from a string and swaying gently.
 */
export function CityLanternMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const swingRef = useRef<THREE.Group>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  // deterministic per-position phase (not Math.random — impure during render, and would
  // reshuffle the sway on every re-render anyway).
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);

  const bodyRadius = Math.max(0.45, Math.min(1.1, footprint * 0.85));
  const capHeight = bodyRadius * 0.3;
  const tasselLength = bodyRadius * 0.5;
  const stringLength = Math.max(0.6, height * 0.28);
  const pivotY = stringLength + bodyRadius * 2 + capHeight;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (swingRef.current) {
      swingRef.current.rotation.z = Math.sin(t * 0.6 + phase) * 0.06;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, pivotY - stringLength / 2, 0]} frustumCulled={false}>
        <cylinderGeometry args={[0.02, 0.02, stringLength, 6]} />
        <meshStandardMaterial color="#4a4033" roughness={0.8} />
      </mesh>

      {/* pivoted at the string's attachment point so the sway reads as a real hanging swing */}
      <group ref={swingRef} position={[0, pivotY, 0]}>
        <mesh position={[0, -capHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
          <cylinderGeometry args={[bodyRadius * 0.22, bodyRadius * 0.34, capHeight, 8]} />
          <meshStandardMaterial color="#3a2f24" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, -capHeight - bodyRadius, 0]} frustumCulled={false} onClick={handleClick}>
          <icosahedronGeometry args={[bodyRadius, 1]} />
          <meshStandardMaterial color="#2c1420" emissive={color} emissiveIntensity={1.0} roughness={0.4} flatShading />
        </mesh>
        <mesh position={[0, -capHeight - bodyRadius, 0]} scale={[1.04, 1.04, 1.04]} frustumCulled={false}>
          <icosahedronGeometry args={[bodyRadius, 1]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
        </mesh>
        <mesh position={[0, -capHeight - bodyRadius * 2 - tasselLength / 2, 0]} frustumCulled={false} onClick={handleClick}>
          <coneGeometry args={[bodyRadius * 0.16, tasselLength, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.5} />
        </mesh>
        <pointLight position={[0, -capHeight - bodyRadius, 0]} color={color} intensity={0.9} distance={4} decay={2} />
      </group>

      <Billboard position={[0, pivotY + 0.5, 0]}>
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
