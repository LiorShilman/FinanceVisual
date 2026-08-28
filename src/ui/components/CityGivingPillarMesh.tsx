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

const STONE_COLOR = '#1c1e24';
// a brushed neutral pewter, not the entity's own bright rose/magenta health color — a spinning
// award-star reads as a distinct, dignified marker on its own shape alone; a bright pink cast on
// top of that read as a toy, not a recognition piece. The gold rim (this city's own established
// "money" accent) is the only color the entity's own hue would otherwise have carried.
const STAR_COLOR = '#a7adb6';
const RIM_COLOR = '#c2921f';
// a crisp dark contour, not the same warm gold as the pedestal/glow — matching the same
// EdgesGeometry treatment used on the cash-runway plane (CityCashRunway.tsx): a near-black outline
// pops much more clearly against the star's own pale metal than the previous gold rim did, which
// tended to blend into the star's own warm-toned glow instead of reading as a defined edge.
const OUTLINE_COLOR = '#0a0c11';
const SPIN_SPEED = 0.5;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// A real 5-pointed star outline, extruded for actual depth (not a flat cutout) — points straight
// up at rotation 0, matching every other upright icon in this city.
function buildStarShape(outerRadius: number, innerRadius: number, points = 5): THREE.Shape {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  return shape;
}

/**
 * A donation reads as recognition, not a shrine — a solid, brushed-metal five-point star, mounted
 * on a plain stone pedestal and slowly spinning on its own vertical axis, replacing an earlier
 * offering-bowl-and-flame design that read as too ornamental next to the rest of the city's more
 * restrained buildings/trees/bridge. The star alone is enough to mark "donation" as its own
 * category without leaning on a narrative object.
 */
export function CityGivingPillarMesh({ x, z, height, footprint, name, amount, labelScale = 1, onOpen }: Props) {
  const starRef = useRef<THREE.Group>(null);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const pedestalRadius = Math.max(0.5, Math.min(0.9, footprint * 0.7));
  const pedestalHeight = Math.max(0.5, Math.min(1.0, height * 0.22));
  // "not too small" — sized as a real fraction of the entity's own height/footprint, not a token
  // icon dwarfed by its own pedestal.
  const outerRadius = Math.max(0.9, Math.min(1.7, Math.max(footprint * 1.3, height * 0.4)));
  const innerRadius = outerRadius * 0.42;
  const starThickness = outerRadius * 0.34;
  const starY = pedestalHeight + outerRadius * 0.95;

  // deterministic per-position phase (not Math.random — impure during render, and would reshuffle
  // on every re-render anyway) so multiple donation stars don't all spin in lockstep.
  const seed = x * 12.9898 + z * 78.233;
  const phase = hash(seed) * Math.PI * 2;

  const starGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(buildStarShape(outerRadius, innerRadius), {
      depth: starThickness,
      bevelEnabled: true,
      bevelThickness: starThickness * 0.18,
      bevelSize: outerRadius * 0.06,
      bevelSegments: 2,
    });
    geometry.center();
    return geometry;
  }, [outerRadius, innerRadius, starThickness]);
  const starEdges = useMemo(() => new THREE.EdgesGeometry(starGeometry), [starGeometry]);

  useFrame(({ clock }) => {
    if (starRef.current) starRef.current.rotation.y = clock.elapsedTime * SPIN_SPEED + phase;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, pedestalHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[pedestalRadius, pedestalRadius * 1.1, pedestalHeight, 10]} />
        <meshStandardMaterial color={STONE_COLOR} emissive={RIM_COLOR} emissiveIntensity={0.18} roughness={0.75} flatShading />
      </mesh>

      <group ref={starRef} position={[0, starY, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={handleClick}>
        <mesh geometry={starGeometry} frustumCulled={false}>
          <meshStandardMaterial color={STAR_COLOR} emissive={STAR_COLOR} emissiveIntensity={0.28} roughness={0.35} metalness={0.55} flatShading />
        </mesh>
        <lineSegments geometry={starEdges} frustumCulled={false}>
          <lineBasicMaterial color={OUTLINE_COLOR} />
        </lineSegments>
      </group>
      <pointLight position={[0, starY, 0]} color={RIM_COLOR} intensity={0.4} distance={4} decay={2} />

      <Billboard position={[0, starY + outerRadius + 0.7, 0]}>
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
