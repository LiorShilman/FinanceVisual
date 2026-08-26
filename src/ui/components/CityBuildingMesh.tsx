import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { computeTiers, getFacadeTexture } from './cityTowerShared';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  // compensates for buildings sitting in the locked/long-term depth tier reading smaller on
  // screen purely from being further from the camera — see CityView.tsx's own commonProps.
  labelScale?: number;
  onOpen: () => void;
}

export function CityBuildingMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Props) {
  const facadeTexture = useMemo(() => getFacadeTexture(), []);
  const tiers = useMemo(() => computeTiers(height, footprint), [height, footprint]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const tierTops = tiers.reduce<number[]>((acc, tier) => [...acc, (acc[acc.length - 1] ?? 0) + tier.h], []);
  const ledgeHeight = 0.05;
  const tierMeshes = tiers.map((tier, i) => {
    const y = tierTops[i] - tier.h / 2;
    return (
      <group key={i}>
        <mesh position={[0, y, 0]} frustumCulled={false} onClick={handleClick}>
          <boxGeometry args={[tier.fp, tier.h, tier.fp]} />
          <meshStandardMaterial
            color="#4a5162"
            map={facadeTexture}
            emissive={color}
            emissiveMap={facadeTexture}
            emissiveIntensity={0.95}
            roughness={0.55}
          />
        </mesh>
        {/* a solid ledge at the top of every tier but the last — makes each setback read as a
            distinct storey break, not just a texture seam. */}
        {i < tiers.length - 1 && (
          <mesh position={[0, tierTops[i] + ledgeHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <boxGeometry args={[tier.fp * 1.06, ledgeHeight, tier.fp * 1.06]} />
            <meshStandardMaterial color="#171a22" roughness={0.8} />
          </mesh>
        )}
      </group>
    );
  });

  const roofFootprint = tiers[tiers.length - 1].fp * 1.12;
  const roofHeight = Math.max(0.08, height * 0.015);

  return (
    <group position={[x, 0, z]}>
      {tierMeshes}
      <mesh position={[0, height + roofHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[roofFootprint, roofHeight, roofFootprint]} />
        <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.25} roughness={0.6} />
      </mesh>
      <Billboard position={[0, height + roofHeight + 0.85, 0]}>
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
