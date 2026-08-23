import { useMemo } from 'react';
import * as THREE from 'three';
import type { IncomeLinkPath } from '../../domain/incomeLinks';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  paths: IncomeLinkPath[];
}

const RADIUS = 0.07;
const COLOR = '#ffd166';
const Y_OFFSET = 0.03;

// A right-angle "circuit board" route, not a straight or curved line — move across in x first,
// then in z, with a sharp corner in between. Two LineCurve3 segments joined in a CurvePath keep
// the corner crisp instead of a CatmullRom curve rounding it off. Each point samples its own
// terrain height (not a flat Y_OFFSET) — the two ends can now sit at genuinely different ground
// heights, so a flat line would cut through hills or hover over dips.
function buildElbowGeometry(fromX: number, fromZ: number, toX: number, toZ: number): THREE.TubeGeometry {
  const start = new THREE.Vector3(fromX, Y_OFFSET + getTerrainHeight(fromX, fromZ), fromZ);
  const end = new THREE.Vector3(toX, Y_OFFSET + getTerrainHeight(toX, toZ), toZ);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  if (Math.abs(fromX - toX) < 0.01 || Math.abs(fromZ - toZ) < 0.01) {
    // already aligned on one axis — a corner segment here would be zero-length, which
    // degenerates the tube geometry, so just go straight.
    curve.add(new THREE.LineCurve3(start, end));
  } else {
    const corner = new THREE.Vector3(toX, Y_OFFSET + getTerrainHeight(toX, fromZ), fromZ);
    curve.add(new THREE.LineCurve3(start, corner));
    curve.add(new THREE.LineCurve3(corner, end));
  }
  return new THREE.TubeGeometry(curve, 16, RADIUS, 6, false);
}

export function CityIncomeLinks({ paths }: Props) {
  const geometries = useMemo(
    () => paths.map(({ from: [fx, fz], to: [tx, tz] }) => buildElbowGeometry(fx, fz, tx, tz)),
    [paths],
  );

  return (
    <group>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} frustumCulled={false}>
          <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.55} roughness={0.25} metalness={0.15} />
        </mesh>
      ))}
    </group>
  );
}
