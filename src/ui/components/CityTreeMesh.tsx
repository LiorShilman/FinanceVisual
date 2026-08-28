import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { computeCanopyRadius, computeTreeLabelY, computeTrunkHeight, computeTrunkRadius, type TreeVariant } from './cityGrowthGeometry';
import { CityThickOutline } from './CityThickOutline';

const OUTLINE_COLOR = '#0a0c11';

// One shared, module-level soft-shadow texture (dark center fading to fully transparent) — every
// tree tints and sizes the same texture instead of each generating its own canvas.
let sharedShadowTexture: THREE.CanvasTexture | null = null;
function getShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTexture) return sharedShadowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  sharedShadowTexture = texture;
  return texture;
}

interface Props {
  x: number;
  z: number;
  height: number;
  footprint: number;
  color: string;
  name: string;
  amount: string;
  variant: TreeVariant;
  /** Suppressed for a top-3 medaled entity — CityMedalBadge owns its whole name/amount label
   * stack instead (with the trophy sitting between the two), so this mesh's own label would
   * otherwise duplicate it right next to the canopy. */
  hideLabel?: boolean;
  labelScale?: number;
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

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function CityTreeMesh({ x, z, height, footprint, name, amount, variant, hideLabel, labelScale = 1, onOpen }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const palette = CANOPY_PALETTE[variant];
  const trunkHeight = computeTrunkHeight(height, variant);
  const trunkRadiusBottom = computeTrunkRadius(height, footprint, variant);
  const trunkRadiusTop = trunkRadiusBottom * 0.7;
  const canopyRadius = computeCanopyRadius(height, footprint, variant);

  const trunkGeometry = useMemo(
    () => new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 7),
    [trunkRadiusTop, trunkRadiusBottom, trunkHeight],
  );
  const trunkEdges = useMemo(() => new THREE.EdgesGeometry(trunkGeometry), [trunkGeometry]);
  const pineTierGeometries = useMemo(() => {
    if (variant !== 'pine') return [];
    return [0, 1, 2].map((i) => {
      const tierR = canopyRadius * (1 - i * 0.24);
      const tierH = canopyRadius * 0.95;
      const geometry = new THREE.ConeGeometry(tierR, tierH, 8);
      return { geometry, edges: new THREE.EdgesGeometry(geometry) };
    });
  }, [variant, canopyRadius]);

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
  const blobGeometries = useMemo(
    () =>
      blobs.map((b) => {
        const geometry = new THREE.IcosahedronGeometry(canopyRadius * b.scale, 1);
        return { geometry, edges: new THREE.EdgesGeometry(geometry) };
      }),
    [blobs, canopyRadius],
  );

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
  const labelY = computeTreeLabelY(height, footprint, variant);

  return (
    <group position={[x, 0, z]}>
      {/* a soft contact shadow at the base, not a flat colored glow — every growth category
          shares one uninformative flat amber as its "health color" (see the palette comment
          above), so a disc tinted by it never actually meant anything category- or entity-
          specific; it just always read as the same gold puck under every tree regardless of
          species or size. A shadow that scales with the tree's own canopy radius is a real,
          variable cue instead. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[canopyRadius * 1.1, 20]} />
        <meshBasicMaterial map={getShadowTexture()} transparent opacity={0.6} depthWrite={false} />
      </mesh>

      <mesh geometry={trunkGeometry} position={[0, trunkHeight / 2, 0]} frustumCulled={false} onClick={handleClick}>
        <meshStandardMaterial color={palette.bark} roughness={0.85} />
      </mesh>
      <CityThickOutline geometry={trunkEdges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, trunkHeight / 2, 0]} />

      {variant === 'pine' ? (
        // a stack of three shrinking cones — the classic conifer silhouette, distinct from every
        // other variant's rounded clump canopy.
        [0, 1, 2].map((i) => {
          const tierH = canopyRadius * 0.95;
          const tierY = trunkHeight + i * tierH * 0.62;
          return (
            <group key={i}>
              <mesh geometry={pineTierGeometries[i].geometry} position={[0, tierY + tierH / 2, 0]} frustumCulled={false} onClick={handleClick}>
                <meshStandardMaterial color={palette.base} emissive={palette.base} emissiveIntensity={0.18} roughness={0.8} />
              </mesh>
              <CityThickOutline geometry={pineTierGeometries[i].edges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, tierY + tierH / 2, 0]} />
            </group>
          );
        })
      ) : (
        <>
          {blobs.map((b, i) => (
            <group key={i}>
              <mesh geometry={blobGeometries[i].geometry} position={[b.x, canopyBaseY + b.y, b.z]} frustumCulled={false} onClick={handleClick}>
                <meshStandardMaterial
                  color={b.light ? palette.light : palette.base}
                  emissive={b.light ? palette.light : palette.base}
                  emissiveIntensity={0.22}
                  roughness={0.85}
                  flatShading
                />
              </mesh>
              <CityThickOutline
                geometry={blobGeometries[i].edges}
                color={OUTLINE_COLOR}
                linewidth={1.3}
                position={[b.x, canopyBaseY + b.y, b.z]}
              />
            </group>
          ))}
          {fruits.map((f, i) => (
            <mesh key={i} position={[f.x, canopyBaseY + f.y, f.z]} frustumCulled={false}>
              <sphereGeometry args={[canopyRadius * 0.16, 8, 8]} />
              <meshStandardMaterial color="#e2793a" emissive="#e2793a" emissiveIntensity={0.7} roughness={0.4} />
            </mesh>
          ))}
        </>
      )}

      {!hideLabel && (
        <Billboard position={[0, labelY, 0]}>
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
      )}
    </group>
  );
}
