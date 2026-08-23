import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';

interface Props {
  x: number;
  z: number;
  y: number;
  name: string;
  photoUrl?: string;
}

// Sized to actually read next to buildings up to 9 units tall from a normal, zoomed-out city
// view (camera can now sit up to 200 units out) — 0.62 and then 1.3 both still vanished at that
// distance; this is deliberately closer to a whole building's own footprint (up to 1.7) than to a
// small icon.
const SIZE = 2.6;
const CORNER_RADIUS = SIZE * 0.22;
const FRAME_MARGIN = 0.18;

/** A rounded square, not a circle — a circular mask was cropping the actual photo content (faces
 * cut off at the sides/top). Built as a Shape rather than a primitive box/plane so the corners can
 * be rounded; ShapeGeometry's default UVs are each vertex's raw local x/y (not normalized to
 * [0,1] — see the same fix in CityGround.tsx's buildBlobGeometry), so they're rebuilt here from
 * the shape's own width/height or the photo texture would sample the wrong region entirely. */
function buildRoundedRectGeometry(size: number, radius: number): THREE.BufferGeometry {
  const half = size / 2;
  const r = Math.min(radius, half);
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);

  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, position.getX(i) / size + 0.5, position.getY(i) / size + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Hovers a family member's photo (or an initials fallback, while the photo loads or if there
 * isn't one) above the cluster of buildings they own. Texture load is manual rather than
 * useLoader/useTexture — those suspend, which would need a Suspense boundary threaded through
 * CityView for no benefit here, since a data URL resolves near-instantly anyway. Only ever set
 * from the async onLoad callback (never synchronously in the effect body), and compared against
 * the current photoUrl before use, so a stale texture from a since-replaced photo can't flash.
 */
export function CityFamilyAvatar({ x, z, y, name, photoUrl }: Props) {
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null);

  useEffect(() => {
    if (!photoUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(photoUrl, (texture) => {
      if (!cancelled) setLoaded({ url: photoUrl, texture });
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const texture = loaded && loaded.url === photoUrl ? loaded.texture : null;
  const initial = name.trim().charAt(0) || '?';

  const frameGeometry = useMemo(() => buildRoundedRectGeometry(SIZE + FRAME_MARGIN, CORNER_RADIUS + FRAME_MARGIN / 2), []);
  const contentGeometry = useMemo(() => buildRoundedRectGeometry(SIZE, CORNER_RADIUS), []);

  return (
    // One shared Billboard, like CitySun — a real (not sub-cm) z gap between the coplanar layers,
    // same sign/order as the original working version, just scaled up: 0.001/0.002 was within
    // float/depth-buffer precision error at normal city-viewing distances (read as flicker), but
    // an explicit depthTest={false} override (tried and reverted) fought the normal opaque/
    // transparent draw order instead of fixing it — the background disc won and hid everything
    // behind it. Plain depth testing with a real gap is enough on its own.
    <Billboard position={[x, y, z]}>
      <mesh geometry={frameGeometry} frustumCulled={false} renderOrder={0}>
        <meshBasicMaterial color="#0a0c11" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {texture ? (
        <mesh geometry={contentGeometry} position={[0, 0, 0.04]} frustumCulled={false} renderOrder={1}>
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : (
        <>
          <mesh geometry={contentGeometry} position={[0, 0, 0.04]} frustumCulled={false} renderOrder={1}>
            <meshBasicMaterial color="#3a4256" />
          </mesh>
          <Text
            position={[0, 0, 0.08]}
            fontSize={1.4}
            color="#f1f3f8"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
            frustumCulled={false}
            renderOrder={2}
          >
            {initial}
          </Text>
        </>
      )}
    </Billboard>
  );
}
