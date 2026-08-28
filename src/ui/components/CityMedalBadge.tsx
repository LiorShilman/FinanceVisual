import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CityThickOutline } from './CityThickOutline';

const OUTLINE_COLOR = '#0a0c11';

interface Props {
  x: number;
  z: number;
  y: number;
  rank: 1 | 2 | 3;
  name: string;
  amount: string;
  labelScale?: number;
}

const RANK_STYLE: Record<1 | 2 | 3, { metal: string; label: string }> = {
  1: { metal: '#e8b923', label: '1' },
  2: { metal: '#c3c9d4', label: '2' },
  3: { metal: '#c17a3f', label: '3' },
};

const ROTATE_SPEED = 0.35;
const BOB_SPEED = 1.6;
const BOB_AMPLITUDE = 0.1;
// how far above the name the trophy's own base sits — the name text grows taller with labelScale
// (see CityView's long-term-tier compensation), so a fixed lift let the enlarged name's own top
// climb up into the trophy sitting right above it. Scaling the lift by the same factor keeps the
// gap between them proportional instead of shrinking away as the text grows.
const TROPHY_LIFT_BASE = 1.15;

/**
 * A small floating trophy above each of the top-3 largest growth holdings (savings/investment/
 * pension/studyFund, ranked together by amount regardless of which of the four they are) — gold/
 * silver/bronze by rank. A flat Billboard coin always presents the exact same perfect-circle
 * silhouette to the camera, which read as "a painted dot" rather than an object — this is a real
 * cup/stem/base shape (same near-black-base-plus-emissive-tint recipe as the insurance shield)
 * that slowly turns in place, so its outline genuinely changes with the viewing angle.
 *
 * Owns the entity's whole label stack (the underlying tree/mesh's own label is suppressed for a
 * medaled entity — see CityView's `hideLabel`), stacked name → trophy → amount bottom to top, so
 * the trophy visibly sits *between* the two texts instead of floating above an already-complete
 * label.
 */
export function CityMedalBadge({ x, z, y, rank, name, amount, labelScale = 1 }: Props) {
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

  const trophyLift = TROPHY_LIFT_BASE * labelScale;
  const baseRadius = 0.62;
  const baseHeight = 0.17;
  const stemHeight = 0.36;
  const stemRadius = 0.1;
  const cupHeight = 0.9;
  const cupTopRadius = 0.76;
  const cupBottomRadius = 0.3;
  const cupY = baseHeight + stemHeight + cupHeight / 2;
  const trophyTopY = baseHeight + stemHeight + cupHeight;
  const material = (intensity: number) => (
    <meshStandardMaterial color="#020203" emissive={style.metal} emissiveIntensity={intensity} metalness={0.4} roughness={0.4} flatShading />
  );

  const baseGeometry = useMemo(() => new THREE.CylinderGeometry(baseRadius, baseRadius * 1.15, baseHeight, 8), [baseRadius, baseHeight]);
  const baseEdges = useMemo(() => new THREE.EdgesGeometry(baseGeometry), [baseGeometry]);
  const stemGeometry = useMemo(() => new THREE.CylinderGeometry(stemRadius, stemRadius * 1.5, stemHeight, 8), [stemRadius, stemHeight]);
  const stemEdges = useMemo(() => new THREE.EdgesGeometry(stemGeometry), [stemGeometry]);
  const cupGeometry = useMemo(() => new THREE.CylinderGeometry(cupTopRadius, cupBottomRadius, cupHeight, 8), [cupTopRadius, cupBottomRadius, cupHeight]);
  const cupEdges = useMemo(() => new THREE.EdgesGeometry(cupGeometry), [cupGeometry]);

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <Billboard>
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

      <group position={[0, trophyLift, 0]}>
        <pointLight color={style.metal} intensity={0.75} distance={4} decay={2} />

        <mesh geometry={baseGeometry} position={[0, baseHeight / 2, 0]} frustumCulled={false}>
          {material(0.5)}
        </mesh>
        <CityThickOutline geometry={baseEdges} color={OUTLINE_COLOR} linewidth={1.4} position={[0, baseHeight / 2, 0]} />
        <mesh geometry={stemGeometry} position={[0, baseHeight + stemHeight / 2, 0]} frustumCulled={false}>
          {material(0.5)}
        </mesh>
        <CityThickOutline geometry={stemEdges} color={OUTLINE_COLOR} linewidth={1.4} position={[0, baseHeight + stemHeight / 2, 0]} />
        <mesh geometry={cupGeometry} position={[0, cupY, 0]} frustumCulled={false}>
          {material(0.85)}
        </mesh>
        {/* real edges, not the previous bright wireframe-rim trick — see CityThickOutline's own
            doc-comment for why every facet-highlight of this kind in the city has been switching
            over to it. */}
        <CityThickOutline geometry={cupEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, cupY, 0]} />

        <Billboard position={[0, trophyTopY + 0.95, 0]}>
          <Text
            fontSize={1.05}
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

        {amount !== '' && (
          <Billboard position={[0, trophyTopY + 2.0, 0]}>
            <Text
              fontSize={0.58 * labelScale}
              color="#ffd166"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.03}
              outlineColor="#7a4a00"
              outlineBlur={0.02}
              fontWeight="bold"
              frustumCulled={false}
            >
              {amount}
            </Text>
          </Billboard>
        )}
      </group>
    </group>
  );
}
