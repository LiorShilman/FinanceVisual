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
//
// Structure first, randomness second: solid floor plates and mullions are drawn as a deliberate
// grid, and only the window fill itself varies — a handful of muted brightness levels, not a coin
// flip between "off" and "blazing" for every cell — so it reads as an actual façade with visible
// floors, not a scattered, noisy speckle pattern.
let sharedFacadeTexture: THREE.CanvasTexture | null = null;
function getFacadeTexture(): THREE.CanvasTexture {
  if (sharedFacadeTexture) return sharedFacadeTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#333849';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 5;
  const cellW = size / cols;
  const cellH = size / rows;
  const windowLevels = ['rgba(190,205,225,0.28)', 'rgba(180,205,235,0.55)', 'rgba(220,232,250,0.8)', 'rgba(255,214,150,0.9)'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const level = windowLevels[Math.floor(Math.random() * windowLevels.length)];
      ctx.fillStyle = level;
      const padX = cellW * 0.16;
      const padY = cellH * 0.24;
      ctx.fillRect(c * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
    }
  }

  // mullions/floor plates drawn on top, as solid lines — the structure that keeps the whole thing
  // from reading as scribble even when the window fill underneath is busy.
  ctx.strokeStyle = 'rgba(10,12,17,0.85)';
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellH);
    ctx.lineTo(size, r * cellH);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellW, 0);
    ctx.lineTo(c * cellW, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
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
      <Billboard position={[0, height + roofHeight + 0.55, 0]}>
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
          frustumCulled={false}
        >
          {name}
        </Text>
      </Billboard>
    </group>
  );
}
