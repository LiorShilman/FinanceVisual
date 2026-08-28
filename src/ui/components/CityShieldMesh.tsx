import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { CityThickOutline } from './CityThickOutline';

const OUTLINE_COLOR = '#0a0c11';

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

/**
 * Insurance gets a shield instead of a tower. Two earlier attempts didn't read well: a flat
 * heraldic outline only looks like a shield viewed roughly face-on (this city's steep camera
 * angle foreshortened it into a grey sliver), and a smooth dome-over-a-point body — while
 * correctly readable from any angle — had no surface detail at all, so up close it just looked
 * like a small solid-colored blob.
 *
 * This is a faceted hexagonal gem (a low-poly cylinder, not a smooth sphere) tapering to a point,
 * banded by a separate metallic collar ring partway up — the facet edges catch the scene lighting
 * differently per face even without a texture, and the two-tone body/collar split reads as
 * "crafted object", not a flat cutout. Sized up from the original scale, which read as small next
 * to a full tower even at a healthy weight. The cross emblem stays on its own Billboard, always
 * turned to face the camera regardless of which facet happens to be toward the viewer.
 */
export function CityShieldMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  // bumped from 2.1/2.35 and 2.4/1.3 — the shield read as small even at a healthy weight, the
  // same complaint the shield's own doc-comment above already notes was true of an earlier design
  // too ("Sized up from the original scale, which read as small next to a full tower").
  const width = Math.max(2.7, footprint * 2.9);
  const bodyHeight = Math.max(3.1, height * 1.6);
  const radiusTop = width / 2;
  const collarY = bodyHeight * 0.72;
  const collarHeight = bodyHeight * 0.14;
  const collarRadius = radiusTop * 1.14;
  const crossSize = width * 0.4;
  const crossArm = crossSize * 0.32;

  const bodyGeometry = useMemo(() => new THREE.CylinderGeometry(radiusTop, radiusTop * 0.06, bodyHeight, 6), [radiusTop, bodyHeight]);
  const bodyEdges = useMemo(() => new THREE.EdgesGeometry(bodyGeometry), [bodyGeometry]);
  const collarGeometry = useMemo(() => new THREE.CylinderGeometry(collarRadius, collarRadius, collarHeight, 6), [collarRadius, collarHeight]);
  const collarEdges = useMemo(() => new THREE.EdgesGeometry(collarGeometry), [collarGeometry]);

  return (
    <group position={[x, 0, z]}>
      {/* base color near-black (not the usual dark-navy every tiered tower uses) so the emissive
          tint is the only thing determining the visible color, regardless of how bright the
          scene's ambient/directional lights are — a lit navy base here washed out to flat grey. */}
      <mesh geometry={bodyGeometry} position={[0, bodyHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <meshStandardMaterial color="#020203" emissive={color} emissiveIntensity={0.7} roughness={0.5} metalness={0.25} flatShading />
      </mesh>
      {/* the collar — a distinct metallic band, not just the same body color repeated, so the
          shield reads as an assembled object with real parts instead of one flat-colored mass.
          A mid-grey base (not a light silver) — under this city's bright ambient/directional
          lighting, a light diffuse base plus high metalness plus its own emissive all stacked
          together and blew out toward white. */}
      <mesh geometry={collarGeometry} position={[0, collarY, 0]} frustumCulled={false} onClick={handleClick}>
        <meshStandardMaterial color="#4a4e5c" roughness={0.45} metalness={0.55} flatShading />
      </mesh>
      <CityThickOutline geometry={collarEdges} color={OUTLINE_COLOR} linewidth={1.4} position={[0, collarY, 0]} />
      {/* real edges on the main facets, not the previous scaled-up wireframe copy (see
          CityThickOutline's own doc-comment) — pop against the emissive glow the same way, just
          crisper and at a real controllable thickness. */}
      <CityThickOutline geometry={bodyEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, bodyHeight / 2, 0]} />
      <pointLight position={[0, bodyHeight * 0.8, 0]} color={color} intensity={0.35} distance={3} decay={2} />

      {/* the actual protection signal — always turned to face the camera via Billboard, so it
          reads clearly no matter which of the body's six facets happens to face the viewer. */}
      <Billboard position={[0, bodyHeight + 0.35, 0]}>
        <mesh frustumCulled={false} onClick={handleClick} renderOrder={1}>
          <boxGeometry args={[crossArm, crossSize, crossArm * 0.6]} />
          <meshStandardMaterial color="#fff3e0" emissive="#fff3e0" emissiveIntensity={1.4} roughness={0.3} />
        </mesh>
        <mesh frustumCulled={false} onClick={handleClick} renderOrder={1}>
          <boxGeometry args={[crossSize, crossArm, crossArm * 0.6]} />
          <meshStandardMaterial color="#fff3e0" emissive="#fff3e0" emissiveIntensity={1.4} roughness={0.3} />
        </mesh>
      </Billboard>

      <Billboard position={[0, bodyHeight + 1.15, 0]}>
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
