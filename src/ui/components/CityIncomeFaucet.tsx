import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface Props {
  /** Where the stream should land — the income district's own buildings, so salary visibly
   * "pours in" from outside the city rather than starting arbitrarily at the rooftop. */
  targetX: number;
  targetZ: number;
  targetY: number;
}

const FAUCET_COLOR = '#c9a24a';
const DROP_COLOR = '#ffd166';
const DROP_COUNT = 8;
const DROP_RADIUS = 0.21;
const FALL_DURATION = 1.5;
// exported — the whole valve/arm mechanism sits at this fixed absolute height regardless of the
// income district's own (much lower, rooftop-relative) targetY, so anything meant to sit
// alongside or above the faucet itself (not the buildings below it) needs this, not targetY.
export const FAUCET_Y = 13;
export const FAUCET_ARM_LENGTH = 3.1;
const RISER_RADIUS = 0.32;
const RISER_LENGTH = 4.1;
const ARM_RADIUS = 0.27;
const VALVE_RADIUS = 0.56;

/**
 * A floating spigot above the income district, dripping gold droplets down onto the salary
 * buildings — the same gold as the income circuit links, so the stream visually reads as where
 * that money originates before the link lines take over. Sized to actually read from the default
 * camera distance (thick pipes, a real valve wheel, a cap), not a thin technical diagram. Droplets
 * are plain spheres whose position is mutated directly via refs in useFrame (no React state), the
 * standard r3f pattern for cheap per-frame animation without re-rendering.
 */
export function CityIncomeFaucet({ targetX, targetZ, targetY }: Props) {
  // the nozzle sits exactly above the target — no sideways travel for the drops to fake, so the
  // fall is just straight down, which is the only way this actually reads as physically sound.
  // The riser and valve wheel are the parts that live off to the side; the arm carries the pipe
  // back in over the target before it turns to hang the nozzle straight down.
  const nozzleX = targetX;
  const nozzleZ = targetZ;
  const nozzleY = FAUCET_Y - 1.9;
  const faucetX = nozzleX + FAUCET_ARM_LENGTH;
  const faucetZ = nozzleZ;
  const riserCenterY = (FAUCET_Y + nozzleY) / 2 + 0.9;

  const dropRefs = useRef<(THREE.Mesh | null)[]>([]);
  const phases = useMemo(() => Array.from({ length: DROP_COUNT }, (_, i) => i / DROP_COUNT), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < DROP_COUNT; i++) {
      const mesh = dropRefs.current[i];
      if (!mesh) continue;
      const progress = (t / FALL_DURATION + phases[i]) % 1;
      // gravity-eased straight drop — no horizontal component needed since the nozzle is already
      // directly above the target.
      const y = nozzleY + (targetY - nozzleY) * (progress * progress);
      mesh.position.set(nozzleX, y, nozzleZ);
      const fade = Math.sin(progress * Math.PI);
      mesh.scale.setScalar(0.5 + 0.5 * fade);
    }
  });

  return (
    <group>
      {/* riser */}
      <mesh position={[faucetX, riserCenterY, faucetZ]} frustumCulled={false}>
        <cylinderGeometry args={[RISER_RADIUS, RISER_RADIUS, RISER_LENGTH, 14]} />
        <meshStandardMaterial color={FAUCET_COLOR} metalness={0.65} roughness={0.3} />
      </mesh>
      {/* end cap */}
      <mesh position={[faucetX, riserCenterY + RISER_LENGTH / 2 + 0.18, faucetZ]} frustumCulled={false}>
        <sphereGeometry args={[RISER_RADIUS * 1.15, 14, 14]} />
        <meshStandardMaterial color={FAUCET_COLOR} metalness={0.65} roughness={0.3} />
      </mesh>
      {/* valve wheel — default torus orientation already faces +Z (lies in the XY plane), which is
          exactly right for a wheel mounted on the side of a vertical pipe facing the viewer, so
          it's deliberately left unrotated. */}
      <mesh position={[faucetX, riserCenterY, faucetZ + RISER_RADIUS + 0.05]} frustumCulled={false}>
        <torusGeometry args={[VALVE_RADIUS, 0.075, 8, 20]} />
        <meshStandardMaterial color="#8a6a2a" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* handle bar across the wheel's face, lying flat in the same plane as the ring */}
      <mesh
        position={[faucetX, riserCenterY, faucetZ + RISER_RADIUS + 0.05]}
        rotation={[0, 0, Math.PI / 2]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.11, 0.11, VALVE_RADIUS * 1.9, 8]} />
        <meshStandardMaterial color="#8a6a2a" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* horizontal spout arm */}
      <mesh
        position={[faucetX - FAUCET_ARM_LENGTH / 2, nozzleY + 0.7, faucetZ]}
        rotation={[0, 0, Math.PI / 2]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[ARM_RADIUS, ARM_RADIUS, FAUCET_ARM_LENGTH, 14]} />
        <meshStandardMaterial color={FAUCET_COLOR} metalness={0.65} roughness={0.3} />
      </mesh>
      {/* nozzle — a plain cylinder's default axis is already vertical (Y), exactly what a
          downward-hanging spout needs, so it's left unrotated; wide where it meets the arm,
          narrowing toward the tip the droplets fall from. */}
      <mesh position={[nozzleX, nozzleY, faucetZ]} frustumCulled={false}>
        <cylinderGeometry args={[0.36, 0.17, 0.85, 14]} />
        <meshStandardMaterial color={FAUCET_COLOR} metalness={0.65} roughness={0.3} />
      </mesh>

      {Array.from({ length: DROP_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            dropRefs.current[i] = el;
          }}
          frustumCulled={false}
        >
          <sphereGeometry args={[DROP_RADIUS, 10, 10]} />
          <meshStandardMaterial color={DROP_COLOR} emissive={DROP_COLOR} emissiveIntensity={0.85} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}
