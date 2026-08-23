import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { ExpenseType } from '../../domain/entity';
import { computeTiers, getFacadeTexture } from './cityTowerShared';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  expenseType: ExpenseType;
  onOpen: () => void;
}

const ACCENT_COLOR = '#e05a5a';

/**
 * Same tiered-tower massing every building uses (color stays the shared expense-risk red, so
 * "red = expense" still reads at a glance) with one small accessory mesh layered on top by
 * expenseType — a gable roof for housing, wheels for transport, an awning for food. 'other' gets
 * no accessory at all, so it looks exactly like the plain building it used to be.
 */
export function CityExpenseMesh({ x, z, height, footprint, color, name, amount, expenseType, onOpen }: Props) {
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
        {i < tiers.length - 1 && (
          <mesh position={[0, tierTops[i] + ledgeHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <boxGeometry args={[tier.fp * 1.06, ledgeHeight, tier.fp * 1.06]} />
            <meshStandardMaterial color="#171a22" roughness={0.8} />
          </mesh>
        )}
      </group>
    );
  });

  const topFootprint = tiers[tiers.length - 1].fp;
  const roofFootprint = topFootprint * 1.12;
  const roofHeight = Math.max(0.08, height * 0.015);
  const baseFootprint = tiers[0].fp;

  const accessory = (() => {
    if (expenseType === 'housing') {
      const half = roofFootprint / 2;
      const slope = Math.max(0.4, roofFootprint * 0.5);
      return (
        <group position={[0, height + roofHeight, 0]} onClick={handleClick}>
          <mesh position={[-half / 2, slope * 0.25, 0]} rotation={[0, 0, Math.PI / 5]} frustumCulled={false}>
            <boxGeometry args={[slope, 0.06, roofFootprint * 1.02]} />
            <meshStandardMaterial color="#8a4b3a" roughness={0.7} />
          </mesh>
          <mesh position={[half / 2, slope * 0.25, 0]} rotation={[0, 0, -Math.PI / 5]} frustumCulled={false}>
            <boxGeometry args={[slope, 0.06, roofFootprint * 1.02]} />
            <meshStandardMaterial color="#8a4b3a" roughness={0.7} />
          </mesh>
        </group>
      );
    }
    if (expenseType === 'transport') {
      const wheelR = Math.max(0.14, baseFootprint * 0.16);
      const offset = baseFootprint / 2 + 0.02;
      return (
        <group onClick={handleClick}>
          {[-offset, offset].map((xOff) => (
            <mesh key={xOff} position={[xOff, wheelR, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
              <torusGeometry args={[wheelR, wheelR * 0.35, 8, 16]} />
              <meshStandardMaterial color="#20242e" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </group>
      );
    }
    if (expenseType === 'food') {
      const awningW = baseFootprint * 1.3;
      const awningDepth = Math.max(0.3, baseFootprint * 0.35);
      return (
        <mesh
          position={[0, height * 0.22, baseFootprint / 2 + awningDepth / 2]}
          rotation={[-Math.PI / 10, 0, 0]}
          frustumCulled={false}
          onClick={handleClick}
        >
          <boxGeometry args={[awningW, 0.06, awningDepth]} />
          <meshStandardMaterial color={ACCENT_COLOR} emissive={ACCENT_COLOR} emissiveIntensity={0.4} roughness={0.6} />
        </mesh>
      );
    }
    return null;
  })();

  return (
    <group position={[x, 0, z]}>
      {tierMeshes}
      <mesh position={[0, height + roofHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[roofFootprint, roofHeight, roofFootprint]} />
        <meshStandardMaterial color="#20242e" emissive={color} emissiveIntensity={0.25} roughness={0.6} />
      </mesh>
      {accessory}
      <Billboard position={[0, height + roofHeight + 0.85, 0]}>
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
