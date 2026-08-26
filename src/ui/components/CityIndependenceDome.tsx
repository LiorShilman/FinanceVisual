import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';

interface Props {
  x: number;
  z: number;
  radius: number;
  // uncapped (can exceed 1 once past the target) — the visual intensity below clamps it, the
  // headline text doesn't, so reaching or passing 100% still reads correctly.
  progress: number;
  // '' hides the ₪ line (respects hideAmounts) without this component needing to know why; the
  // % headline still always shows — a ratio alone doesn't disclose real amounts the way a raw ₪
  // figure would.
  amountLabel: string;
  // '' hides this line too (same hideAmounts reasoning) — what a 4%/year safe withdrawal off the
  // current balance looks like per month, so it's directly comparable to a real monthly budget.
  monthlyLabel: string;
  // '' skips this line (no essential expenses entered yet, so there's no real target to project
  // toward) — not gated by hideAmounts, since a duration alone doesn't disclose a ₪ figure.
  yearsLabel: string;
}

const GOLD = '#ffd166';
// muted/pale far from the goal, vivid and saturated once close to or past it — the dome's whole
// presence grows with progress instead of a literal rising liquid level (see the comment below
// for why a rising fill was dropped).
const SHELL_COLOR_EMPTY = new THREE.Color('#7d93a8');
const SHELL_COLOR_FULL = new THREE.Color('#3fa0f2');

// A gradient sky with soft cloud blobs and a warm golden glow — the dome's own texture, so it
// reads as genuine sky rather than a flat tinted glass color.
//
// Canvas Y=0 maps to the dome's own apex (top pole, thetaStart=0) and Y=size maps to its rim
// (thetaLength=PI/2, ground level) — see the sphereGeometry args below. The camera's normal,
// mostly-horizontal view of the city only ever sees the region near the *rim*, i.e. close to
// Y=size: a first version put the clouds only across the canvas's middle band and a bright
// near-white glow right at the bottom, so the one region the camera actually sees was a plain
// bright haze with no clouds in it at all, and the clouds themselves only ever showed up if you
// tilted the view sharply upward toward the apex. Clouds now span the *entire* canvas height, and
// the base gradient is a muted mid-blue throughout instead of fading to near-white — no bright,
// cloudless band anywhere in it.
function createSkyTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, size, 0, 0);
  sky.addColorStop(0, '#6fa8d8');
  sky.addColorStop(0.5, '#5f96cc');
  sky.addColorStop(1, '#3f7fce');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(size * 0.5, size * 0.92, 0, size * 0.5, size * 0.92, size * 0.55);
  glow.addColorStop(0, 'rgba(255, 210, 140, 0.28)');
  glow.addColorStop(1, 'rgba(255, 210, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // bigger, higher-contrast blobs than the first pass — at the dome's huge real-world scale, small
  // faint clouds mipmap down into an indistinct blur; these stay legible from a normal viewing
  // distance.
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 36 + Math.random() * 74;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, 'rgba(255,255,255,0.95)');
    cloud.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/**
 * One giant transparent dome enclosing the whole city — the actual "half-circle the whole map
 * sits inside" the user asked for — whose sky-textured presence grows brighter, more saturated,
 * and more colorful the closer the household gets to its financial-independence number (the
 * 300×/4%-rule target from domain/independence.ts), instead of a separate rising "liquid level".
 *
 * A literal rising fill (either at the dome's own huge scale, or as a smaller nested dome) was
 * tried and dropped: at this dome's necessary size (large enough to geometrically enclose the
 * whole map, lake and valley included), any flat "liquid surface" reads as a wall-to-wall white
 * haze from the default downward-angled camera, and a smaller nested dome — while legible — sits
 * right on top of whichever building happens to be near the map's center. Modulating the *whole
 * shell's* opacity/color/glow by progress keeps the one big enclosing dome the user asked for,
 * stays legible at any camera angle, and never competes with or covers a specific building.
 */
export function CityIndependenceDome({ x, z, radius, progress, amountLabel, monthlyLabel, yearsLabel }: Props) {
  const skyTexture = useMemo(() => createSkyTexture(), []);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const shellColor = useMemo(() => SHELL_COLOR_EMPTY.clone().lerp(SHELL_COLOR_FULL, clampedProgress), [clampedProgress]);
  const shellOpacity = 0.08 + clampedProgress * 0.4;
  const ringOpacity = 0.2 + clampedProgress * 0.6;

  // high enough to clear every building, trophy and floating label in the city (all well under
  // 15) and sit visibly against the dome's own sky backdrop near the top of the frame, instead of
  // reading as just more ground-level clutter among the entities.
  const labelY = 27;

  return (
    <group position={[x, 0, z]}>
      {/* BackSide only (the standard skybox/dome trick): with the camera normally inside it,
          that's the single inward-facing layer of geometry that's actually visible, so it reads
          as one clean glass surface instead of two overlapping transparent layers (near wall +
          far wall) fighting each other in the depth buffer. */}
      {/* meshBasicMaterial, not meshStandardMaterial — this scene's own lighting is deliberately
          dark/night-like (see computeCityAtmosphere), so a *lit* material here alpha-blends
          mostly with that darkness and reads as black-blue instead of sky. An unlit material
          shows its own true texture/color regardless of scene lighting, which is what "sky
          inside the dome" actually needs. */}
      <mesh frustumCulled={false}>
        <sphereGeometry args={[radius, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial map={skyTexture} color={shellColor} transparent opacity={shellOpacity} side={THREE.BackSide} />
      </mesh>
      {/* a bright ring right on the ground marks the dome's own footprint clearly. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} frustumCulled={false}>
        <ringGeometry args={[radius - 0.4, radius, 72]} />
        <meshBasicMaterial color={shellColor} transparent opacity={ringOpacity} side={THREE.DoubleSide} />
      </mesh>

      <Billboard position={[0, labelY, 0]}>
        <Text
          fontSize={1.8}
          color={GOLD}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.045}
          outlineColor="#5a3d00"
          fontWeight="bold"
          frustumCulled={false}
        >
          {`${Math.round(progress * 100)}% לעצמאות כלכלית`}
        </Text>
        {amountLabel !== '' && (
          <Text
            position={[0, -1.1, 0]}
            fontSize={1}
            color="#ffffff"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.04}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
          >
            {amountLabel}
          </Text>
        )}
        {monthlyLabel !== '' && (
          <Text
            position={[0, -2.4, 0]}
            fontSize={0.82}
            color="#ffe0a3"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.034}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
          >
            {monthlyLabel}
          </Text>
        )}
        {yearsLabel !== '' && (
          <Text
            position={[0, -3.55, 0]}
            fontSize={0.9}
            color="#9fe6c0"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.036}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
          >
            {yearsLabel}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
