import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { computeMagnitudeShare } from '../../domain/sizing';
import { formatCurrency } from '../format';
import type { NetWorthBreakdown } from '../../domain/netWorth';

interface Props {
  x: number;
  y: number;
  z: number;
  /** null when amounts are hidden for sharing — the sun still shines, just without the figure. */
  breakdown: NetWorthBreakdown | null;
}

// A fixed absolute ₪ scale (same philosophy as sizing.ts elsewhere) — the sun's size AND how much
// it actually brightens the scene both grow with net worth, not just its label text. Reads as a
// literal "the better things are, the more light there is over the city" reward.
const MIN_RADIUS = 1.6;
const MAX_RADIUS = 5.5;
const MIN_LIGHT = 0.4;
const MAX_LIGHT = 2;
const POSITIVE_COLOR = '#ffc400';
const NEGATIVE_COLOR = '#e05a5a';

// One shared, module-level glow texture (white center fading to fully transparent) — the actual
// color comes from tinting it via the material's `color`, so positive/negative states reuse it.
// A single smooth gradient plane avoids the "concentric rings" look that stacked semi-transparent
// spheres produce when their silhouette edges become visible at an angle.
let sharedGlowTexture: THREE.CanvasTexture | null = null;
function getGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture) return sharedGlowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  sharedGlowTexture = texture;
  return texture;
}

export function CitySun({ x, y, z, breakdown }: Props) {
  const glowTexture = useMemo(() => getGlowTexture(), []);
  const total = breakdown?.total ?? 0;
  const isNegative = breakdown !== null && total < 0;
  const share = computeMagnitudeShare(Math.abs(total));
  const radius = MIN_RADIUS + share * (MAX_RADIUS - MIN_RADIUS);
  const lightIntensity = MIN_LIGHT + share * (MAX_LIGHT - MIN_LIGHT);
  const color = isNegative ? NEGATIVE_COLOR : POSITIVE_COLOR;
  const liquidColor = breakdown !== null && breakdown.liquidOnly < 0 ? NEGATIVE_COLOR : '#8fe0b0';
  // moved a bit further from the sun than the previous pass, all measured from this one shared
  // Billboard's own local origin now that the glow and text live under the same transform.
  const textBaseY = -(radius * 1.3 + 1.6);

  return (
    <group position={[x, y, z]}>
      {/* the light that actually brightens the city — not just decoration, this is what makes
          "better numbers" visibly light up the whole scene. */}
      <pointLight color={color} intensity={lightIntensity} decay={1.2} />

      {/* solid disc — self-lit regardless of scene lighting/fog, like a real sun. Not billboarded
          (a sphere looks the same from every angle), so it can't drift relative to the glow/text. */}
      <mesh frustumCulled={false}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color={color} fog={false} />
      </mesh>

      {/* one single Billboard for both the glow and the text stack — two separate Billboards
          (as before) each compute their own face-camera rotation independently, which is exactly
          what let the text drift off the sun's true x-center; sharing one transform keeps them
          locked together. */}
      <Billboard>
        {/* explicit renderOrder on the glow and every text label below — without it, three.js
            falls back to sorting these (all transparent, all roughly the same distance from
            camera within one Billboard) by distance each frame, and that sort is unstable enough
            to occasionally flip their draw order — which, since the glow is additive and the text
            isn't, made the text visibly flash/wash out as if it were re-rendering. Pinning the
            order removes the ambiguity entirely. */}
        <mesh frustumCulled={false} renderOrder={0}>
          <planeGeometry args={[radius * 4.5, radius * 4.5]} />
          <meshBasicMaterial
            map={glowTexture}
            color={color}
            transparent
            opacity={0.45}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>

        {breakdown !== null && (
          <>
            <Text
              position={[0, textBaseY + 1.9, 0]}
              fontSize={1.1}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.07}
              outlineColor="#0a0c11"
              outlineBlur={0.02}
              fontWeight="bold"
              frustumCulled={false}
              renderOrder={1}
            >
              {formatCurrency(total)}
            </Text>
            <Text
              position={[0, textBaseY + 0.8, 0]}
              fontSize={0.68}
              color={liquidColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.045}
              outlineColor="#0a0c11"
              outlineBlur={0.015}
              fontWeight="bold"
              frustumCulled={false}
              renderOrder={1}
            >
              {`נזיל ללא פנסיה: ${formatCurrency(breakdown.liquidOnly)}`}
            </Text>
          </>
        )}
        <Text
          position={[0, textBaseY, 0]}
          fontSize={0.44}
          color="#c3cadb"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#0a0c11"
          fontWeight="bold"
          frustumCulled={false}
          renderOrder={1}
        >
          הון עצמי — חיסכון + השקעות + פנסיה, פחות חובות
        </Text>
      </Billboard>
    </group>
  );
}
