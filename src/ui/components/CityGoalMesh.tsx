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
  /** currentAmount / targetAmount, clamped to [0, 1] by the caller. */
  progress: number;
  onOpen: () => void;
}

/**
 * A goal reads as literally under construction — a wireframe shell at the full target size, with
 * a solid mass filling it from the ground up as it gets funded. At 0% it's an empty scaffold; at
 * 100% the solid box exactly fills the shell, same footprint as a finished building.
 */
export function CityGoalMesh({ x, z, height, footprint, color, name, amount, progress, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const solidHeight = Math.max(0.02, height * progress);

  return (
    <group position={[x, 0, z]}>
      {/* the finished shape, as a wireframe shell — always full size regardless of progress */}
      <mesh position={[0, height / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[footprint, height, footprint]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.55} />
      </mesh>
      {/* the funded portion, solid, growing from the ground up */}
      {progress > 0 && (
        <mesh position={[0, solidHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
          <boxGeometry args={[footprint * 0.94, solidHeight, footprint * 0.94]} />
          <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.8} roughness={0.5} />
        </mesh>
      )}

      <Billboard position={[0, height + 0.7, 0]}>
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
