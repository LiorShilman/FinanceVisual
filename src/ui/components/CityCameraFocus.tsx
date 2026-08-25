import { useEffect, useRef, type ElementRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls } from '@react-three/drei';

interface Props {
  controlsRef: React.RefObject<ElementRef<typeof OrbitControls> | null>;
  // the point to recenter the view on (the growth-forecast entity's own tree), or null when no
  // forecast is open — becoming non-null (or changing to a different point) is what triggers a
  // fresh glide.
  target: { x: number; y: number; z: number } | null;
}

const GLIDE_SPEED = 2.6; // how quickly the view catches up per second — not instant, so the move reads as a deliberate pan rather than a jarring cut
// a wide establishing shot of the whole city (the default camera distance) reads as "far away"
// once recentered on one small tree — pulling the distance into this range on the same glide is
// what makes it read as "zooming in on the tree" rather than just sliding the same wide view
// sideways to a new spot.
const FOCUS_DISTANCE_MIN = 11;
const FOCUS_DISTANCE_MAX = 17;

/**
 * Recenters the current view onto a new focus point when the growth-forecast calculator opens for
 * an entity, and pulls the camera in to a close-up distance — keeps the camera's existing viewing
 * *angle* (the mouse-set offset direction from OrbitControls' own target), the same "preserve the
 * offset" trick CityWalkControls uses for walking, but rescales that offset's length so the move
 * reads as "zoom in on this tree" rather than sliding the same wide establishing shot sideways.
 */
export function CityCameraFocus({ controlsRef, target }: Props) {
  const goalRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    goalRef.current = target ? new THREE.Vector3(target.x, target.y, target.z) : null;
  }, [target]);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    const goal = goalRef.current;
    if (!controls || !goal) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const currentDistance = offset.length();
    const focusDistance = Math.max(FOCUS_DISTANCE_MIN, Math.min(FOCUS_DISTANCE_MAX, currentDistance));
    const goalOffset = offset.clone().normalize().multiplyScalar(focusDistance);

    const targetDistance = controls.target.distanceTo(goal);
    const offsetDistance = offset.distanceTo(goalOffset);
    if (targetDistance < 0.02 && offsetDistance < 0.02) {
      goalRef.current = null;
      return;
    }

    const step = Math.min(1, GLIDE_SPEED * delta);
    controls.target.lerp(goal, step);
    offset.lerp(goalOffset, step);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  });

  return null;
}
