import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

interface Props {
  /** Typically a `THREE.EdgesGeometry` — real edges/corners only, same source every plain
   * `<lineSegments>` outline elsewhere in this city already builds from. */
  geometry: THREE.BufferGeometry;
  color: string;
  /** Screen pixels, not world units — a real line stays a crisp, constant thickness regardless of
   * camera distance, the same way this app's own 2D board edges/text outlines already do. */
  linewidth?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

/**
 * A genuinely thick outline — plain `THREE.LineBasicMaterial`'s own `linewidth` is silently
 * ignored on almost every real GPU/browser (a long-standing WebGL limitation, not a bug in this
 * app), so every EdgesGeometry outline in the city rendered at a hairline 1px no matter what
 * `linewidth` was set to. `LineSegments2`/`LineMaterial` (three.js's own "fat lines" example
 * module) is the actual supported way to get real thickness, at the cost of needing the canvas's
 * pixel `resolution` kept in sync (see the effect below) — that's the one piece plain line
 * materials never needed and this one does.
 */
export function CityThickOutline({ geometry, color, linewidth = 2, position, rotation, scale }: Props) {
  const size = useThree((s) => s.size);

  const segments = useMemo(() => {
    const positions = geometry.attributes.position.array as ArrayLike<number>;
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(Array.from(positions));
    const material = new LineMaterial({ color, linewidth, worldUnits: false });
    return new LineSegments2(lineGeometry, material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, color, linewidth]);

  useEffect(() => {
    segments.material.resolution.set(size.width, size.height);
  }, [segments, size]);

  return <primitive object={segments} position={position} rotation={rotation} scale={scale} frustumCulled={false} />;
}
