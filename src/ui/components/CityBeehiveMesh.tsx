import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { CityThickOutline } from './CityThickOutline';

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

const STRAW_LIGHT = '#c2921f';
const STRAW_DARK = '#a9822f';
const OUTLINE_COLOR = '#0a0c11';
const BAND_COUNT = 5;
const BEE_COUNT = 3;

function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// wide at the base, narrowing toward the top — a classic woven "skep" silhouette.
function widthAt(t: number): number {
  return Math.max(0.15, Math.sin((1 - t) * Math.PI * 0.5));
}

/**
 * Income gets a beehive instead of a tower — modest and low (income shouldn't tower over the
 * skyline the way a debt/growth building does), still tinted in income's own green via emissive,
 * and "industrious" the way a paycheck actually is. The woven-straw read comes from real stacked,
 * tapering bands with dark ridge rings between them (not a texture), so it holds up at any zoom
 * instead of looking like a flat solid dome.
 */
export function CityBeehiveMesh({ x, z, height, footprint, color, name, amount, labelScale = 1, onOpen }: Props) {
  const beeRefs = useRef<(THREE.Group | null)[]>([]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const hiveHeight = Math.min(3.7, Math.max(1.7, height * 0.76));
  const baseRadius = Math.max(0.85, Math.min(1.85, footprint * 1.45));

  const bands = useMemo(
    () =>
      Array.from({ length: BAND_COUNT }, (_, i) => {
        const tBottom = i / BAND_COUNT;
        const tTop = (i + 1) / BAND_COUNT;
        return {
          y: tBottom * hiveHeight,
          h: hiveHeight / BAND_COUNT,
          radiusBottom: baseRadius * widthAt(tBottom),
          radiusTop: baseRadius * widthAt(tTop),
        };
      }),
    [hiveHeight, baseRadius],
  );
  const bandGeometries = useMemo(
    () =>
      bands.map((band) => {
        const geometry = new THREE.CylinderGeometry(band.radiusTop, band.radiusBottom, band.h, 12);
        return { geometry, edges: new THREE.EdgesGeometry(geometry) };
      }),
    [bands],
  );

  // deterministic per-position orbit parameters (not Math.random — impure during render, and
  // would reshuffle the bees on every re-render anyway).
  const seed = x * 12.9898 + z * 78.233;
  const bees = useMemo(
    () =>
      Array.from({ length: BEE_COUNT }, (_, i) => ({
        radius: baseRadius * (1.3 + hash(seed + i * 3.1) * 0.5),
        speed: 0.6 + hash(seed + i * 5.7) * 0.5,
        phase: hash(seed + i * 2.3) * Math.PI * 2,
        y: hiveHeight * (0.4 + hash(seed + i * 7.1) * 0.5),
      })),
    [seed, baseRadius, hiveHeight],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < bees.length; i++) {
      const g = beeRefs.current[i];
      if (!g) continue;
      const b = bees[i];
      const angle = t * b.speed + b.phase;
      g.position.set(Math.cos(angle) * b.radius, b.y + Math.sin(t * 3 + b.phase) * 0.08, Math.sin(angle) * b.radius);
      g.rotation.y = -angle + Math.PI / 2;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {bands.map((band, i) => (
        <group key={i}>
          <mesh geometry={bandGeometries[i].geometry} position={[0, band.y + band.h / 2, 0]} frustumCulled={false} onClick={handleClick}>
            <meshStandardMaterial
              color={i % 2 === 0 ? STRAW_LIGHT : STRAW_DARK}
              emissive={color}
              emissiveIntensity={0.3}
              roughness={0.85}
            />
          </mesh>
          <CityThickOutline geometry={bandGeometries[i].edges} color={OUTLINE_COLOR} linewidth={1.6} position={[0, band.y + band.h / 2, 0]} />
          {i < bands.length - 1 && (
            <mesh position={[0, band.y + band.h, 0]} frustumCulled={false}>
              <torusGeometry args={[band.radiusTop * 1.03, band.h * 0.09, 6, 16]} />
              <meshStandardMaterial color="#5c4023" roughness={0.9} />
            </mesh>
          )}
        </group>
      ))}
      {/* the entrance hole — the one dark accent that reads as "there's a real structure here",
          not just stacked rings. */}
      <mesh position={[0, hiveHeight * 0.2, baseRadius * widthAt(0.2) * 0.98]} frustumCulled={false}>
        <circleGeometry args={[baseRadius * 0.15, 12]} />
        <meshStandardMaterial color="#1a1208" roughness={1} />
      </mesh>

      {bees.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            beeRefs.current[i] = el;
          }}
        >
          <mesh frustumCulled={false}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color="#f0c419" emissive="#f0c419" emissiveIntensity={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.055]} frustumCulled={false}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#1a1208" roughness={0.6} />
          </mesh>
        </group>
      ))}

      <Billboard position={[0, hiveHeight + 0.85, 0]}>
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
