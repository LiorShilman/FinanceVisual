import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getFacadeTexture, getRoofTexture } from './cityTowerShared';

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
 * A mortgage is the one debt tied to a literal home, so it gets CityHouseMesh's own body — a box
 * with a pyramid roof, not the tiered office-tower massing every other category (including plain
 * debt) uses — so it reads as a genuinely different kind of building on sight, not a tower with a
 * decoration on top. The same window-lit facade and shingle-roof textures every other tower in the
 * city uses (see cityTowerShared) keep it from reading as a flat, out-of-place solid-color box.
 * What marks it as still being a debt (not an owned asset): the walls are tinted in the debt
 * category's own color (blue, escalating to risk-red) instead of real estate's neutral grey, plus
 * a small pennant flag planted at the roof peak that no other mesh in the city uses.
 */
export function CityMortgageMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const facadeTexture = useMemo(() => getFacadeTexture(), []);
  const roofTexture = useMemo(() => getRoofTexture(), []);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  // capped low, unlike every other mesh's height (which scales all the way up to MAX_HEIGHT) —
  // a mortgage stays a single-story "ground house" regardless of loan size, so it never towers
  // over the skyline; the loan amount still reads through the footprint (a bigger mortgage gets a
  // wider house, not a taller one), same as CityHouseMesh's own real-estate footprint.
  const wallHeight = Math.min(2.0, Math.max(1.1, height * 0.4));
  const roofHeight = Math.min(1.4, Math.max(0.85, height * 0.3));
  const base = Math.max(1.3, footprint * 1.7);

  const poleHeight = Math.max(0.55, roofHeight * 0.7);
  const flagW = poleHeight * 0.7;
  const flagH = poleHeight * 0.45;
  const roofPeakY = wallHeight + roofHeight;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, wallHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[base, wallHeight, base]} />
        <meshStandardMaterial
          color="#4a5162"
          map={facadeTexture}
          emissive={color}
          emissiveMap={facadeTexture}
          emissiveIntensity={0.95}
          roughness={0.55}
        />
      </mesh>
      {/* a muted clay/slate tint, not the vivid orange-red the shared shingle texture defaults
          to elsewhere (CityExpenseMesh's housing type) — keeps the same texture map for real
          shingle detail without reading as a flat, solid-red cap. */}
      <mesh position={[0, wallHeight + roofHeight / 2, 0]} rotation={[0, Math.PI / 4, 0]} frustumCulled={false} onClick={handleClick}>
        <coneGeometry args={[(base * Math.SQRT2) / 2, roofHeight, 4]} />
        <meshStandardMaterial
          color="#8a7060"
          map={roofTexture}
          emissive="#6b5748"
          emissiveMap={roofTexture}
          emissiveIntensity={0.25}
          roughness={0.85}
        />
      </mesh>

      <mesh position={[0, roofPeakY + poleHeight / 2, 0]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.04, poleHeight, 6]} />
        <meshStandardMaterial color="#3a3f4d" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[flagW / 2, roofPeakY + poleHeight - flagH / 2, 0]} frustumCulled={false}>
        <planeGeometry args={[flagW, flagH]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      <Billboard position={[0, roofPeakY + poleHeight + 0.55, 0]}>
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
