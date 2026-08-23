import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface Props {
  x: number;
  z: number;
  footprint: number;
}

const PULSE_SPEED = 2.2;
const COLOR = '#ff4d4d';

/**
 * A pulsing ring on the ground under any building whose computed health is 'risk' — the existing
 * health-color system already turns a struggling debt/goal/insurance entity's building itself
 * red, but a red building sitting among other buildings (some of which are red by category, like
 * every expense) doesn't reliably stand out as "needs attention" versus "this is just what an
 * expense looks like". Motion is the one signal color alone can't be confused with.
 */
export function CityRiskAura({ x, z, footprint }: Props) {
  const ringRef = useRef<THREE.Mesh>(null);
  // deterministic per-position phase (not Math.random — impure during render, and multiple rings
  // pulsing in lockstep would read as one blinking grid instead of individually alive).
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);
  const baseRadius = Math.max(0.7, footprint * 0.9);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.elapsedTime;
    const pulse = (Math.sin(t * PULSE_SPEED + phase) + 1) / 2; // 0..1
    const scale = 1 + pulse * 0.35;
    ringRef.current.scale.setScalar(scale);
    const material = ringRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.45 + pulse * 0.5;
  });

  return (
    <mesh ref={ringRef} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <ringGeometry args={[baseRadius * 0.7, baseRadius, 32]} />
      <meshBasicMaterial color={COLOR} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
