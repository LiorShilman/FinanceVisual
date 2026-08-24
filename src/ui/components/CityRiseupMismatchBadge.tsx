import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

interface Props {
  x: number;
  z: number;
  y: number;
}

// Same warning-orange as the "medium" depth-tier label and the health-warning family — a
// question mark rather than an exclamation point: this isn't "something is wrong", it's
// "something doesn't match, go look" (see EntityFormPanel's own riseupLink comparison box).
const COLOR = '#f0a95a';
const RING_RADIUS = 0.5;

// A soft radial glow (white fading to transparent, tinted via the material's own color) rather
// than a flat opaque disc — the disc read as a dull dark blob; this, plus a real pointLight and a
// slowly spinning ring (same halo treatment as CityGoalMesh's completed-goal ring), gives the
// badge actual presence instead of a flat 2D sticker floating in space.
let sharedGlowTexture: THREE.CanvasTexture | null = null;
function getGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture) return sharedGlowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  sharedGlowTexture = texture;
  return texture;
}

/**
 * A small floating "?" — only rendered for entities whose linked RiseUp field (see
 * domain/entity.ts's riseupLink) doesn't match what RiseUp actually shows this month. Bobs
 * gently and carries a slowly spinning ring + real point light, so it reads as "notice me"
 * without being as loud as the risk aura's pulsing ground ring; disappears the moment the numbers
 * agree again, so a healthy city stays visually quiet.
 */
export function CityRiseupMismatchBadge({ x, z, y }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowTexture = useMemo(() => getGlowTexture(), []);
  // deterministic per-position phase (not Math.random — impure during render) so multiple badges
  // don't bob/spin in lockstep.
  const phase = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % (Math.PI * 2);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.position.y = y + Math.sin(t * 1.8 + phase) * 0.12;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.7 + phase;
      ringRef.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.8 + phase) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <pointLight color={COLOR} intensity={1.1} distance={5} decay={2} />
      <mesh ref={ringRef} frustumCulled={false}>
        <torusGeometry args={[RING_RADIUS, RING_RADIUS * 0.1, 8, 28]} />
        <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={1.1} roughness={0.3} metalness={0.4} />
      </mesh>
      <Billboard>
        <mesh frustumCulled={false} renderOrder={0}>
          <planeGeometry args={[1.9, 1.9]} />
          <meshBasicMaterial
            map={glowTexture}
            color={COLOR}
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
        <Text
          position={[0, 0, 0.05]}
          fontSize={0.72}
          color="#fff3e0"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.035}
          outlineColor="#7a4a12"
          outlineBlur={0.03}
          frustumCulled={false}
          renderOrder={1}
        >
          ?
        </Text>
      </Billboard>
    </group>
  );
}
