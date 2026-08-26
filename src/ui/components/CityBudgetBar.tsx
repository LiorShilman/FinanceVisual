import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';

// a narrow printed-on ruler strip, like a real syringe or graduated test tube — not a grid
// wrapping the whole barrel (an earlier version's full-cylinder wireframe did that, and it read
// as fogging up the whole tube rather than a measurement scale).
function createRulerTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.strokeStyle = 'rgba(214, 227, 238, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(214, 227, 238, 0.9)';
  ctx.lineWidth = 4;
  for (let i = 1; i < 10; i++) {
    const py = h - (i / 10) * h;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, py);
    ctx.lineTo(w * 0.82, py);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Props {
  x: number;
  z: number;
  y: number;
  ratio: number;
  // '' hides these two lines (respects hideAmounts) — the % and the color split above still show
  // regardless, since a ratio alone doesn't disclose a ₪ figure.
  incomeLabel: string;
  splitLabel: string;
}

const FULL_HEIGHT = 4.4;
// the liquid never reaches the glass's own rim — real containers keep headspace at the top, and a
// literal 100%-to-the-brim fill read as if the tube itself were only ever as tall as the data.
const FILL_HEIGHT = FULL_HEIGHT - 0.55;
const RADIUS = 0.4;
// the same muted, dark palette as the emergency-fund gauge's own zones (see
// CityEmergencyGauge.tsx) — a first pass used bright, saturated fill colors that read as flat,
// almost 2D "paint" rather than a real lit surface.
const GOOD_COLOR = '#204d34';
const BAD_COLOR = '#5a1f1b';
// a backing panel behind the tube — the same near-black dial-plate color as the emergency-fund
// gauge (see CityEmergencyGauge.tsx), with a gold frame instead of just floating against the
// scene's own grey sky, which read as flat and unfinished on its own.
const PANEL_COLOR = '#0e0f14';
const FRAME_COLOR = '#c9a24a';
const PANEL_WIDTH = RADIUS * 3.4;
const PANEL_HEIGHT = FULL_HEIGHT + 0.9;
const PANEL_Z = -(RADIUS + 0.35);

/**
 * A standing glass tube, not a dial — the household's whole monthly income as one fixed-height
 * column. Green fills from the bottom up — how much is actually left over — the same way a real
 * fuel or battery gauge reads "what remains," not "what's used"; red sits above it, the portion
 * already spoken for by essential expenses + debt payments (see domain/essentialBurden.ts).
 * Replaces an earlier speedometer version — that one floated in mid-air near the income district
 * and kept colliding with the income faucet's own pipe mechanism. Low-poly/flat-shaded fills (not
 * a smooth cylinder) match the "not solid" recipe used across the rest of the city — see e.g.
 * CityFountainMesh — instead of reading as a flat, painted-on color band.
 */
export function CityBudgetBar({ x, z, y, ratio, incomeLabel, splitLabel }: Props) {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const overCommitted = ratio > 1;
  const greenHeight = (1 - clampedRatio) * FILL_HEIGHT;
  const redHeight = FILL_HEIGHT - greenHeight;

  const rulerTexture = useMemo(() => createRulerTexture(), []);

  return (
    <group position={[x, y, z]}>
      {/* backing panel — gold-framed near-black plate, matching the emergency gauge's own dial. */}
      <mesh position={[0, FULL_HEIGHT / 2, PANEL_Z - 0.03]} frustumCulled={false}>
        <planeGeometry args={[PANEL_WIDTH + 0.14, PANEL_HEIGHT + 0.14]} />
        <meshStandardMaterial color={FRAME_COLOR} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, FULL_HEIGHT / 2, PANEL_Z]} frustumCulled={false}>
        <planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
        <meshStandardMaterial color={PANEL_COLOR} roughness={0.85} />
      </mesh>

      {/* no glass fill anymore — that read as a grey haze over the black panel behind it. Just the
          fills themselves, framed top and bottom by a thin border ring, like a container's rim. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[RADIUS, 20]} />
        <meshStandardMaterial color="#1a1c24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[RADIUS, 0.02, 8, 24]} />
        <meshBasicMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[0, FULL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[RADIUS, 0.02, 8, 24]} />
        <meshBasicMaterial color={FRAME_COLOR} />
      </mesh>

      {/* syringe-style graduation marks — a printed-on ruler texture confined to a thin strip on
          the tube's front face, not a grid wrapped around the whole barrel (an earlier version's
          full-circumference wireframe + tick rings read as fogging up the whole tube, not a
          measurement scale). Sized to FILL_HEIGHT, not FULL_HEIGHT, so its 100% mark lines up with
          the liquid's own actual ceiling, not the empty headspace above it. Mounted just outside
          the glass so it doesn't z-fight with it. */}
      <mesh position={[0, FILL_HEIGHT / 2, RADIUS + 0.01]} frustumCulled={false}>
        <planeGeometry args={[RADIUS * 0.7, FILL_HEIGHT]} />
        <meshBasicMaterial map={rulerTexture} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {greenHeight > 0.001 && (
        <mesh position={[0, greenHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, greenHeight, 8]} />
          <meshStandardMaterial color={GOOD_COLOR} emissive={GOOD_COLOR} emissiveIntensity={0.32} flatShading roughness={0.6} />
        </mesh>
      )}
      {redHeight > 0.001 && (
        <mesh position={[0, greenHeight + redHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, redHeight, 8]} />
          <meshStandardMaterial
            color={overCommitted ? '#6b241d' : BAD_COLOR}
            emissive={overCommitted ? '#6b241d' : BAD_COLOR}
            emissiveIntensity={0.22}
            flatShading
            roughness={0.6}
          />
        </mesh>
      )}
      {/* the boundary between "spoken for" and "free" — a bright ring right at the fill line, so
          the split reads clearly even at a glance. */}
      <mesh position={[0, greenHeight, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <ringGeometry args={[RADIUS * 0.8, RADIUS * 0.98, 20]} />
        <meshBasicMaterial color="#ffe08a" side={THREE.DoubleSide} />
      </mesh>

      {/* well above the tube's own top (FULL_HEIGHT) — the stack's lower lines use *negative*
          local offsets, so the base itself has to clear FULL_HEIGHT by more than just those
          lines' own spacing, or the bottom lines end up back down inside the tube's own height
          range, right where an earlier version of this put them. */}
      <Billboard position={[0, FULL_HEIGHT + 2.6, 0]}>
        <Text fontSize={0.62} color="#ffd166" anchorX="center" anchorY="bottom" outlineWidth={0.028} outlineColor="#5a3d00" fontWeight="bold" frustumCulled={false}>
          {`${Math.round(ratio * 100)}% מההכנסה מחויב`}
        </Text>
        {incomeLabel !== '' && (
          <Text position={[0, -0.7, 0]} fontSize={0.46} color="#ffffff" anchorX="center" anchorY="top" outlineWidth={0.02} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {incomeLabel}
          </Text>
        )}
        {splitLabel !== '' && (
          <Text position={[0, -1.3, 0]} fontSize={0.38} color="#ffe0a3" anchorX="center" anchorY="top" outlineWidth={0.017} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {splitLabel}
          </Text>
        )}
        {overCommitted && (
          <Text position={[0, -1.85, 0]} fontSize={0.42} color="#e05a4e" anchorX="center" anchorY="top" outlineWidth={0.02} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            ⚠ ההוצאות עוברות את ההכנסה
          </Text>
        )}
      </Billboard>
    </group>
  );
}
