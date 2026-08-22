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

const RIBBON_COLOR = '#ffd166';

/**
 * Donations stand out as gift boxes, not office towers — a wrapped box with a crossing ribbon
 * and a bow, sized the same way (footprint/height by rank) so it still fits the district grid,
 * but reads as a deliberately different kind of building at a glance.
 */
export function CityGiftMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const ribbonW = Math.max(0.06, footprint * 0.14);
  const bowRadius = Math.max(0.14, footprint * 0.24);
  const bowY = height + bowRadius * 0.5;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[footprint, height, footprint]} />
        <meshStandardMaterial color="#2a1f33" emissive={color} emissiveIntensity={0.85} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh position={[0, height / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[footprint + 0.02, height + 0.02, ribbonW]} />
        <meshStandardMaterial color={RIBBON_COLOR} emissive={RIBBON_COLOR} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, height / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[ribbonW, height + 0.02, footprint + 0.02]} />
        <meshStandardMaterial color={RIBBON_COLOR} emissive={RIBBON_COLOR} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      <group position={[0, bowY, 0]}>
        <mesh
          position={[-bowRadius * 0.55, 0, 0]}
          rotation={[Math.PI / 2, 0, Math.PI / 5]}
          frustumCulled={false}
          onClick={handleClick}
        >
          <torusGeometry args={[bowRadius * 0.5, bowRadius * 0.16, 8, 16]} />
          <meshStandardMaterial color={RIBBON_COLOR} emissive={RIBBON_COLOR} emissiveIntensity={0.7} roughness={0.3} />
        </mesh>
        <mesh
          position={[bowRadius * 0.55, 0, 0]}
          rotation={[Math.PI / 2, 0, -Math.PI / 5]}
          frustumCulled={false}
          onClick={handleClick}
        >
          <torusGeometry args={[bowRadius * 0.5, bowRadius * 0.16, 8, 16]} />
          <meshStandardMaterial color={RIBBON_COLOR} emissive={RIBBON_COLOR} emissiveIntensity={0.7} roughness={0.3} />
        </mesh>
        <mesh frustumCulled={false} onClick={handleClick}>
          <sphereGeometry args={[bowRadius * 0.28, 12, 12]} />
          <meshStandardMaterial color={RIBBON_COLOR} emissive={RIBBON_COLOR} emissiveIntensity={0.8} roughness={0.25} />
        </mesh>
      </group>

      <Billboard position={[0, bowY + bowRadius + 0.9, 0]}>
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
