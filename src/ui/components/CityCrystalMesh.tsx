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

const PULSE_SPEED = 1.6;
const PULSE_AMPLITUDE = 0.06;
const SPIN_SPEED = 0.25;

/**
 * Crypto/forex investments get a floating, glowing crystal instead of a tiered tower — a
 * deliberately different silhouette that reads as "volatile/digital" next to the plain
 * office-block buildings everything else uses. Standard IcosahedronGeometry, no custom
 * BufferGeometry, same frustumCulled={false} safety net as every other city mesh.
 */
export function CityCrystalMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  // deterministic per-position phase offset (not Math.random — impure during render, and would
  // reshuffle on every re-render anyway) so multiple crystals don't all pulse in lockstep.
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);

  const radius = Math.max(0.4, Math.min(height * 0.4, footprint * 0.9));
  const floatY = radius + 0.5;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 1 + Math.sin(t * PULSE_SPEED + phase) * PULSE_AMPLITUDE;
    if (outerRef.current) {
      outerRef.current.scale.setScalar(pulse);
      outerRef.current.rotation.y = t * SPIN_SPEED;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * SPIN_SPEED * 1.6;
      innerRef.current.rotation.x = t * SPIN_SPEED * 0.7;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={outerRef} position={[0, floatY, 0]} frustumCulled={false} onClick={handleClick}>
        <icosahedronGeometry args={[radius, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          transparent
          opacity={0.55}
          roughness={0.15}
          metalness={0.3}
        />
      </mesh>
      <mesh ref={innerRef} position={[0, floatY, 0]} frustumCulled={false} onClick={handleClick}>
        <icosahedronGeometry args={[radius * 0.55, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} roughness={0.2} metalness={0.4} />
      </mesh>
      <pointLight position={[0, floatY, 0]} color={color} intensity={0.8} distance={4} decay={2} />

      <Billboard position={[0, floatY + radius + 0.7, 0]}>
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
