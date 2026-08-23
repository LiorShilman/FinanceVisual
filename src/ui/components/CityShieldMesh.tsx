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
 * Insurance gets a shield instead of a tower — a squashed sphere (the shield's rounded top half)
 * capped with a downward cone (the pointed bottom), both standard primitives. Reads as
 * "protection" at a glance, distinct from every tiered building around it.
 */
export function CityShieldMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const width = Math.max(0.7, footprint);
  const bodyHeight = Math.max(0.8, height * 0.7);
  const domeH = bodyHeight * 0.55;
  const pointH = bodyHeight * 0.45;
  const thickness = width * 0.32;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, pointH + domeH / 2, 0]} scale={[width / 2, domeH, thickness]} frustumCulled={false} onClick={handleClick}>
        <sphereGeometry args={[1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.85} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, pointH / 2, 0]} rotation={[Math.PI, 0, 0]} frustumCulled={false} onClick={handleClick}>
        <coneGeometry args={[width / 2, pointH, 16]} />
        <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.85} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* thin rim outline so the shield edge reads clearly against the glow */}
      <mesh position={[0, pointH + domeH / 2, 0]} scale={[width / 2 + 0.02, domeH + 0.02, thickness + 0.02]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
      </mesh>

      <Billboard position={[0, bodyHeight + 0.7, 0]}>
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
