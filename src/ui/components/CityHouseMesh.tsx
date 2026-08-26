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
  labelScale?: number;
  onOpen: () => void;
}

/**
 * Real estate is the one category a literal building shape fits perfectly — a box with a pyramid
 * roof (a 4-sided cone rotated to align its edges with the box's corners), instead of the generic
 * office tower every other stock-holding category uses.
 */
export function CityHouseMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const wallHeight = Math.max(0.6, height * 0.7);
  const roofHeight = Math.max(0.5, height * 0.4);
  const base = Math.max(0.9, footprint * 1.3);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, wallHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[base, wallHeight, base]} />
        <meshStandardMaterial color="#4a5162" emissive={color} emissiveIntensity={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, wallHeight + roofHeight / 2, 0]} rotation={[0, Math.PI / 4, 0]} frustumCulled={false} onClick={handleClick}>
        <coneGeometry args={[(base * Math.SQRT2) / 2, roofHeight, 4]} />
        <meshStandardMaterial color="#8a4b3a" roughness={0.7} />
      </mesh>
      {/* a small window glow on the front face — a plain box otherwise reads too generic */}
      <mesh position={[0, wallHeight * 0.5, base / 2 + 0.01]} frustumCulled={false}>
        <planeGeometry args={[base * 0.28, wallHeight * 0.32]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.9} roughness={0.3} />
      </mesh>

      <Billboard position={[0, wallHeight + roofHeight + 0.7, 0]}>
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
