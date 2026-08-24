import { Billboard, Text } from '@react-three/drei';
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
export function CityShieldMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const width = Math.max(1.55, footprint * 1.75);
  const bodyHeight = Math.max(1.75, height * 0.98);
  const radiusTop = width / 2;
  const collarY = bodyHeight * 0.72;
  const collarHeight = bodyHeight * 0.14;
  const collarRadius = radiusTop * 1.14;
  const crossSize = width * 0.4;
  const crossArm = crossSize * 0.32;

  return (
    <group position={[x, 0, z]}>
      {/* base color near-black (not the usual dark-navy every tiered tower uses) so the emissive
          tint is the only thing determining the visible color, regardless of how bright the
          scene's ambient/directional lights are — a lit navy base here washed out to flat grey. */}
      <mesh position={[0, bodyHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[radiusTop, radiusTop * 0.06, bodyHeight, 6]} />
        <meshStandardMaterial color="#020203" emissive={color} emissiveIntensity={0.7} roughness={0.5} metalness={0.25} flatShading />
      </mesh>
      {/* the collar — a distinct metallic band, not just the same body color repeated, so the
          shield reads as an assembled object with real parts instead of one flat-colored mass.
          A mid-grey base (not a light silver) — under this city's bright ambient/directional
          lighting, a light diffuse base plus high metalness plus its own emissive all stacked
          together and blew out toward white. */}
      <mesh position={[0, collarY, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[collarRadius, collarRadius, collarHeight, 6]} />
        <meshStandardMaterial color="#4a4e5c" roughness={0.45} metalness={0.55} flatShading />
      </mesh>
      {/* thin bright rim outline on the main facets so the edges pop against the emissive glow */}
      <mesh position={[0, bodyHeight / 2, 0]} scale={[1.03, 1.01, 1.03]} frustumCulled={false}>
        <cylinderGeometry args={[radiusTop, radiusTop * 0.06, bodyHeight, 6]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
      </mesh>
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
