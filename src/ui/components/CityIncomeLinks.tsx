import { useMemo } from 'react';
import * as THREE from 'three';
import type { IncomeLinkPath } from '../../domain/incomeLinks';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  paths: IncomeLinkPath[];
}

const RADIUS = 0.11;
const COLOR = '#ffd166';
const Y_OFFSET = 0.03;
const UP = new THREE.Vector3(0, 1, 0);

interface Leg {
  position: [number, number, number];
  quaternion: THREE.Quaternion;
  length: number;
}

function buildLeg(start: THREE.Vector3, end: THREE.Vector3): Leg {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  // cylinderGeometry's default axis is +Y — rotating from that onto the leg's own direction is
  // enough to fully orient a straight segment, with no ambiguity to propagate the way a curve's
  // own Frenet frames have.
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize());
  return { position: [mid.x, mid.y, mid.z], quaternion, length };
}

// A right-angle "circuit board" route, not a straight or curved line — move across in x first,
// then in z, with a sharp corner in between. Two independently-oriented straight cylinder
// segments, not a single TubeGeometry over a sharp-cornered CurvePath (the original approach) —
// TubeGeometry derives each cross-section's orientation from Frenet frames propagated along the
// curve, and those frames are notoriously unstable right at a sharp direction change, visibly
// twisting the tube at the corner so it reads as angled instead of a clean 90° bend. A straight
// segment has no such ambiguity: its own orientation is fully determined by its own two endpoints,
// nothing to propagate. Each point samples its own terrain height (not a flat Y_OFFSET) — the two
// ends can sit at genuinely different ground heights, so a flat line would cut through hills or
// hover over dips.
function buildElbowLegs(fromX: number, fromZ: number, toX: number, toZ: number): { legs: Leg[]; corner: THREE.Vector3 | null } {
  const start = new THREE.Vector3(fromX, Y_OFFSET + getTerrainHeight(fromX, fromZ), fromZ);
  const end = new THREE.Vector3(toX, Y_OFFSET + getTerrainHeight(toX, toZ), toZ);
  if (Math.abs(fromX - toX) < 0.01 || Math.abs(fromZ - toZ) < 0.01) {
    // already aligned on one axis — a corner segment here would be zero-length, so just go
    // straight.
    return { legs: [buildLeg(start, end)], corner: null };
  }
  const corner = new THREE.Vector3(toX, Y_OFFSET + getTerrainHeight(toX, fromZ), fromZ);
  return { legs: [buildLeg(start, corner), buildLeg(corner, end)], corner };
}

export function CityIncomeLinks({ paths }: Props) {
  const routes = useMemo(
    () => paths.map(({ from: [fx, fz], to: [tx, tz] }) => buildElbowLegs(fx, fz, tx, tz)),
    [paths],
  );

  return (
    <group>
      {routes.map(({ legs, corner }, i) => (
        <group key={i}>
          {legs.map((leg, li) => (
            <group key={li}>
              {/* flatShading (not the default smooth shading) so the tube's own 6 flat facets —
                  it's a hexagonal, not round, cross-section — actually show as distinct faces
                  catching light differently, instead of blending into what reads as a smooth
                  round wire. */}
              <mesh position={leg.position} quaternion={leg.quaternion} frustumCulled={false}>
                <cylinderGeometry args={[RADIUS, RADIUS, leg.length, 6]} />
                <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.55} roughness={0.3} metalness={0.2} flatShading />
              </mesh>
              {/* a bright wireframe overlay on the same geometry — the same edge-definition trick
                  every other faceted mesh in the city (shield/trophy/fountain/lantern) uses. */}
              <mesh position={leg.position} quaternion={leg.quaternion} frustumCulled={false}>
                <cylinderGeometry args={[RADIUS, RADIUS, leg.length, 6]} />
                <meshBasicMaterial color="#fff3d0" wireframe transparent opacity={0.35} depthWrite={false} />
              </mesh>
            </group>
          ))}
          {/* a small joint sphere hides the seam where two straight segments' flat end-caps meet
              at a right angle — without it, the outer corner of the bend shows a visible notch. */}
          {corner && (
            <mesh position={[corner.x, corner.y, corner.z]} frustumCulled={false}>
              <sphereGeometry args={[RADIUS, 8, 8]} />
              <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.55} roughness={0.3} metalness={0.2} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
