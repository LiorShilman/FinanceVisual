import { useMemo } from 'react';
import * as THREE from 'three';
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

// One shared, module-level texture — generated once for the whole app, not per building, so
// swapping entities never re-uploads GPU textures on every render. A fixed repeat means window
// size isn't perfectly proportional to each building's footprint, which is a fine trade for never
// cloning/re-uploading a texture per instance.
let sharedFacadeTexture: THREE.CanvasTexture | null = null;
function getFacadeTexture(): THREE.CanvasTexture {
  if (sharedFacadeTexture) return sharedFacadeTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#14161f';
  ctx.fillRect(0, 0, size, size);

  const cols = 6;
  const rows = 10;
  const cellW = size / cols;
  const cellH = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.32;
      const warm = Math.random() > 0.5;
      ctx.fillStyle = lit ? (warm ? 'rgba(255,212,140,0.95)' : 'rgba(196,222,255,0.9)') : 'rgba(255,255,255,0.05)';
      const padX = cellW * 0.2;
      const padY = cellH * 0.22;
      ctx.fillRect(c * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharedFacadeTexture = texture;
  return texture;
}

interface Tier {
  h: number;
  fp: number;
}

// Real towers taper as they rise — a single flat-topped box reads as a placeholder, not a
// building. Short buildings stay a single mass (a two-story stack of a tiny box looks silly);
// tall ones step down in 2–3 tiers, which is also where the "impressive" reading matters most.
function computeTiers(height: number, footprint: number): Tier[] {
  if (height < 1.3) return [{ h: height, fp: footprint }];
  if (height < 3.2) {
    return [
      { h: height * 0.62, fp: footprint },
      { h: height * 0.38, fp: footprint * 0.66 },
    ];
  }
  return [
    { h: height * 0.48, fp: footprint },
    { h: height * 0.32, fp: footprint * 0.7 },
    { h: height * 0.2, fp: footprint * 0.44 },
  ];
}

export function CityBuildingMesh({ x, z, height, footprint, color, name, amount, onOpen }: Props) {
  const facadeTexture = useMemo(() => getFacadeTexture(), []);
  const tiers = useMemo(() => computeTiers(height, footprint), [height, footprint]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const tierTops = tiers.reduce<number[]>((acc, tier) => [...acc, (acc[acc.length - 1] ?? 0) + tier.h], []);
  const tierMeshes = tiers.map((tier, i) => {
    const y = tierTops[i] - tier.h / 2;
    return (
      <mesh key={i} position={[0, y, 0]} frustumCulled={false} onClick={handleClick}>
        <boxGeometry args={[tier.fp, tier.h, tier.fp]} />
        <meshStandardMaterial
          color="#3a3f4c"
          map={facadeTexture}
          emissive={color}
          emissiveMap={facadeTexture}
          emissiveIntensity={0.9}
          roughness={0.55}
        />
      </mesh>
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
      <Billboard position={[0, height + roofHeight + 0.55, 0]}>
        <Text
          position={[0, 0.36, 0]}
          fontSize={0.46}
          color="#f1f3f8"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#0a0c11"
          frustumCulled={false}
        >
          {name}
        </Text>
        <Text
          fontSize={0.36}
          color="#c3cadb"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.015}
          outlineColor="#0a0c11"
          frustumCulled={false}
        >
          {amount}
        </Text>
      </Billboard>
    </group>
  );
}
