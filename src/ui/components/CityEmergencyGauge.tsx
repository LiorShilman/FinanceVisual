import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { RECOMMENDED_MIN_MONTHS } from '../../domain/emergencyFund';

interface Props {
  x: number;
  z: number;
  // just above the emergency-fund tree's own canopy/label.
  baseY: number;
  monthsOfRunway: number | null;
  // ₪ still needed to reach RECOMMENDED_MIN_MONTHS — 0 once already there, null with no data.
  // '' (via hideAmounts upstream) hides the line entirely rather than showing a blank amount.
  gapLabel: string;
}

const RADIUS = 1.85;
// lifts the whole gauge a bit further above the tree than `baseY` alone puts it (see the caller's
// own comment on baseY) — per explicit feedback (2026-08-29) that it read as sitting too low/small
// against the tree's own canopy once the tree itself grew.
const EXTRA_LIFT = 0.6;
// the dial reads 0–6 months — the top of the standard "3–6 months" recommended range, not some
// arbitrary round number past it. Capping the scale exactly there means *hitting* the
// recommendation actually pins the needle at the far end of the dial, instead of leaving it
// sitting unremarkably at the halfway mark of a scale that goes twice as far as the advice does.
const MAX_MONTHS = 6;
// the standard advice is "3–6 months," not "3 is risky, 6 is safe" — reaching 3 already means
// you're inside the recommended range, so the dial has just two zones (under the minimum vs. at
// or past it), not three; a middle amber band made hitting 6 months still read as "barely
// escaping orange" instead of the solidly-good result it actually is. Shared with
// domain/emergencyFund.ts's own gap calculation, so the dial's own zone boundary and "how much
// more ₪" text always agree on what "recommended" means.
const RED_END = RECOMMENDED_MIN_MONTHS;

// standard "speedometer" convention: 0 at the left end of the arc (angle=PI), max at the right end
// (angle=0), sweeping clockwise (through the top, angle=PI/2) as the value climbs.
function angleForValue(v: number): number {
  return Math.PI * (1 - Math.max(0, Math.min(MAX_MONTHS, v)) / MAX_MONTHS);
}

/**
 * A speedometer-style dial reading "months of runway" — how long the household's own
 * emergency-fund savings (the `isEmergencyFund` entities, see domain/emergencyFund.ts) would
 * cover its real essential bills with zero income. Mounted right above that entity's own tree, in
 * the same low-poly/flat-shaded/wireframe-rim recipe used across the rest of the city rather than
 * a smooth solid shape.
 */
export function CityEmergencyGauge({ x, z, baseY, monthsOfRunway, gapLabel }: Props) {
  const needleRef = useRef<THREE.Group>(null);
  const displayMonths = monthsOfRunway ?? 0;

  const zones = useMemo(() => {
    const bounds = [0, RED_END, MAX_MONTHS];
    const colors = ['#7a2a24', '#2f6b48'];
    return colors.map((color, i) => {
      const a1 = angleForValue(bounds[i]);
      const a0 = angleForValue(bounds[i + 1]);
      return { color, thetaStart: a0, thetaLength: a1 - a0 };
    });
  }, []);

  useFrame(() => {
    if (needleRef.current) needleRef.current.rotation.z = angleForValue(displayMonths) - Math.PI / 2;
  });

  return (
    <group position={[x, baseY + EXTRA_LIFT, z]}>
      {/* the dial face — near-black base so the color zones (and the needle) are what actually
          reads, not a bright disc. */}
      <mesh frustumCulled={false}>
        <circleGeometry args={[RADIUS, 40, 0, Math.PI]} />
        <meshStandardMaterial color="#0e0f14" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh frustumCulled={false}>
        <ringGeometry args={[0, RADIUS, 16, 1, 0, Math.PI]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>

      {zones.map((zone) => (
        <mesh key={zone.color} position={[0, 0, 0.01]} frustumCulled={false}>
          <ringGeometry args={[RADIUS * 0.78, RADIUS * 0.96, 24, 1, zone.thetaStart, zone.thetaLength]} />
          <meshStandardMaterial color={zone.color} emissive={zone.color} emissiveIntensity={0.3} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* pivots around its own base (this wrapper's own origin), not its center — the same
          "leans/points from its anchor" trick used elsewhere in the city (e.g. the crystal tree's
          mouths) — here it's a rotation, not a lean, but the same base-pivot principle.
          meshBasicMaterial (unlit), not meshStandardMaterial — this scene's ambient light is
          deliberately dark/night-like, so a *lit* material here read as flat black regardless of
          its own color; an unlit material shows its true bright color no matter the scene
          lighting (same fix as the independence dome's shell, see CityIndependenceDome.tsx). A
          first attempt at an "outline" (a larger dark cone just behind a smaller bright one) also
          made it read as solid black — the offset between them was far too small relative to a
          cone's own 3D thickness for the bright one to actually show past it. */}
      <group ref={needleRef} position={[0, 0, 0.02]}>
        <mesh position={[0, RADIUS * 0.42, 0]} frustumCulled={false}>
          <coneGeometry args={[RADIUS * 0.067, RADIUS * 0.86, 4]} />
          <meshBasicMaterial color="#ffe08a" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <cylinderGeometry args={[RADIUS * 0.095, RADIUS * 0.095, RADIUS * 0.08, 10]} />
        <meshStandardMaterial color="#1a1c24" roughness={0.6} />
      </mesh>

      {/* clear of the dial's own rounded top (y=RADIUS) — sitting at 0.55×RADIUS put the text
          overlapping the dial face itself, cutting it off mid-word. */}
      <Billboard position={[0, RADIUS + 0.45, 0]}>
        <Text fontSize={0.5} color="#f1f3f8" anchorX="center" anchorY="bottom" outlineWidth={0.022} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
          {monthsOfRunway === null ? 'אין נתוני הוצאות' : `${displayMonths.toFixed(1)} חודשי שרידות`}
        </Text>
        {gapLabel !== '' && (
          <Text position={[0, -0.6, 0]} fontSize={0.4} color="#ffe0a3" anchorX="center" anchorY="top" outlineWidth={0.018} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {gapLabel}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
