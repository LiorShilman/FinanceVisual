import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

export type TreeVariant = 'sapling' | 'oak' | 'pine' | 'fruit';

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  variant: TreeVariant;
  onOpen: () => void;
}

// every growth category (savings/investment/pension/studyFund) shares one flat 'warning' amber
// as its health color unconditionally — it never actually varies per entity, so replacing the
// tower's amber tint with real per-species greens loses no information; `color` still shows up as
// a soft ground glow, not as the canopy's own color, so the district doesn't go fully mute.
const CANOPY_PALETTE: Record<TreeVariant, { base: string; light: string; bark: string }> = {
  // savings — a young sapling: small, bright, single soft canopy clump.
  sapling: { base: '#4f9a44', light: '#8fd671', bark: '#6b4a2e' },
  // investment — a full broad-canopy tree, several overlapping clumps.
  oak: { base: '#357a3f', light: '#5c9c55', bark: '#5a3d24' },
  // pension — locked/long-term reads as an evergreen conifer: tall, dark, stacked cones.
  pine: { base: '#25543f', light: '#3a7057', bark: '#4a3520' },
  // studyFund — a fruit-bearing tree: an oak-like canopy plus small orange fruit accents.
  fruit: { base: '#3f8a4a', light: '#6bb35e', bark: '#5f4128' },
};

// blob count and color alone read as too similar at typical city-view distance — an overall size
// difference is the one cue that still holds up as a small silhouette. Savings stays a visibly
// young, small sapling; investment grows into a noticeably bigger, broader tree.
const SIZE_SCALE: Record<TreeVariant, number> = { sapling: 0.62, oak: 1.2, pine: 1, fruit: 1 };

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function CityTreeMesh({ x, z, height, footprint, color, name, amount, variant, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const palette = CANOPY_PALETTE[variant];
  const sizeScale = SIZE_SCALE[variant];
  const trunkHeight = Math.max(0.8, Math.min(3.4, height * 0.5)) * sizeScale;
  const trunkRadiusBottom = Math.max(0.1, Math.min(0.24, footprint * 0.13)) * sizeScale;
  const trunkRadiusTop = trunkRadiusBottom * 0.7;
  const canopyRadius = Math.max(0.55, Math.min(1.55, footprint * 0.8 + height * 0.05)) * sizeScale;

  // deterministic per-building jitter (position-seeded, not Math.random()) so the canopy clumps
  // stay stable across re-renders instead of reshuffling every frame.
  const seed = x * 12.9898 + z * 78.233;
  const blobs = useMemo(() => {
    const count = variant === 'sapling' ? 2 : 3;
    return Array.from({ length: count }, (_, i) => {
      const h1 = hash(seed + i * 3.7);
      const h2 = hash(seed + i * 9.1 + 1.3);
      const h3 = hash(seed + i * 5.3 + 2.7);
      const angle = h1 * Math.PI * 2;
      const dist = canopyRadius * 0.32 * (0.35 + h2 * 0.65);
      return {
        x: Math.cos(angle) * dist,
        y: (h3 - 0.5) * canopyRadius * 0.25,
        z: Math.sin(angle) * dist,
        scale: 0.72 + h1 * 0.38,
        light: h2 > 0.5,
      };
    });
  }, [seed, canopyRadius, variant]);

  // anchored to each leaf blob's own surface, pushed out along that blob's own direction away
  // from the trunk (not a uniformly random point on the sphere) and well past its radius — the
  // blobs overlap each other heavily (their centers sit close together relative to their own
  // radii), so a fruit merely "on" one blob's surface is still very likely swallowed by a
  // neighboring blob; only a clear outward push reliably pokes past all of them.
  const fruits = useMemo(() => {
    if (variant !== 'fruit' || blobs.length === 0) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const blob = blobs[i % blobs.length];
      const blobRadius = canopyRadius * blob.scale;
      const h1 = hash(seed + i * 4.4 + 10);
      const h2 = hash(seed + i * 6.6 + 20);
      const outwardMag = Math.hypot(blob.x, blob.z);
      const baseAngle = outwardMag > 0.01 ? Math.atan2(blob.z, blob.x) : i * 2.4;
      const theta = baseAngle + (h1 - 0.5) * 1.4;
      const upTilt = 0.25 + h2 * 0.55;
      const r = blobRadius * (1.25 + h2 * 0.25);
      return {
        x: blob.x + Math.cos(theta) * Math.cos(upTilt) * r,
        y: blob.y + Math.sin(upTilt) * r,
        z: blob.z + Math.sin(theta) * Math.cos(upTilt) * r,
      };
    });
  }, [seed, canopyRadius, variant, blobs]);

  const canopyBaseY = trunkHeight + canopyRadius * 0.15;
  const labelY = variant === 'pine' ? trunkHeight + canopyRadius * 1.9 + 0.4 : canopyBaseY + canopyRadius * 1.15 + 0.4;

  return (
    <group position={[x, 0, z]}>
      {/* a soft glow disc at the base — the one place the entity's own category color still
          shows, tying the tree back to the rest of the city's colored-ground-glow convention. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[canopyRadius * 0.9, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.25} roughness={0.9} />
      </mesh>

      <mesh position={[0, trunkHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <cylinderGeometry args={[trunkRadiusTop, trunkRadiusBottom, trunkHeight, 7]} />
        <meshStandardMaterial color={palette.bark} roughness={0.85} />
      </mesh>

      {variant === 'pine' ? (
        // a stack of three shrinking cones — the classic conifer silhouette, distinct from every
        // other variant's rounded clump canopy.
        [0, 1, 2].map((i) => {
          const tierR = canopyRadius * (1 - i * 0.24);
          const tierH = canopyRadius * 0.95;
          const tierY = trunkHeight + i * tierH * 0.62;
          return (
            <mesh key={i} position={[0, tierY + tierH / 2, 0]} frustumCulled={false} onClick={handleClick}>
              <coneGeometry args={[tierR, tierH, 8]} />
              <meshStandardMaterial color={palette.base} emissive={palette.base} emissiveIntensity={0.18} roughness={0.8} />
            </mesh>
          );
        })
      ) : (
        <>
          {blobs.map((b, i) => (
            <mesh key={i} position={[b.x, canopyBaseY + b.y, b.z]} frustumCulled={false} onClick={handleClick}>
              <icosahedronGeometry args={[canopyRadius * b.scale, 1]} />
              <meshStandardMaterial
                color={b.light ? palette.light : palette.base}
                emissive={b.light ? palette.light : palette.base}
                emissiveIntensity={0.22}
                roughness={0.85}
                flatShading
              />
            </mesh>
          ))}
          {fruits.map((f, i) => (
            <mesh key={i} position={[f.x, canopyBaseY + f.y, f.z]} frustumCulled={false}>
              <sphereGeometry args={[canopyRadius * 0.16, 8, 8]} />
              <meshStandardMaterial color="#e2793a" emissive="#e2793a" emissiveIntensity={0.7} roughness={0.4} />
            </mesh>
          ))}
        </>
      )}

      <Billboard position={[0, labelY, 0]}>
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
