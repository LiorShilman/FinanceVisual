import { useEffect, useRef, type ElementRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls } from '@react-three/drei';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  controlsRef: React.RefObject<ElementRef<typeof OrbitControls> | null>;
  enabled: boolean;
}

const WALK_SPEED = 14; // world units per second — a bit over one LOT_SIZE (2.6) per second
const TURN_SPEED = 0.7; // radians per second — gentle, not a snap-to-angle turn
// roughly person-scale against this city's own buildings (MIN_HEIGHT 0.6, LOT_SIZE 2.6) — high
// enough to clear the low hedges/ground clutter, low enough that walking actually reads as
// walking, not the same bird's-eye height the free-orbit camera starts at. Raised from 2.2 per
// feedback (2026-08-29) — at person height the view sat below a lot of the taller growth trees'
// own canopies instead of looking out across them.
const EYE_HEIGHT = 3.4;
// how quickly the camera settles toward walking height once movement starts — snapping straight
// there on the very first frame reads as a jump-cut; easing it in over roughly half a second feels
// like crouching down into the walk instead.
const HEIGHT_EASE = 4;
// the free-orbit camera is typically angled steeply downward (a bird's-eye view looking down at
// the city) — easing the *height* down while leaving that same steep pitch untouched just means
// standing at eye-height while still staring almost straight down at the ground right underfoot,
// which reads as a black screen with only a thin strip of the map visible at the top. A gentle
// downward tilt (looking slightly ahead-and-down, not levelling out to dead-flat) is what actually
// reads as walking; eased in at the same rate as the height so both settle together.
const WALK_PITCH_TAN = -0.15;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const UP = new THREE.Vector3(0, 1, 0);

/**
 * First-person-style WASD/arrow-key navigation, alongside the existing mouse pan/zoom/orbit — W/S
 * walk forward/backward in whatever direction the camera is currently facing, A/D *turn* that
 * facing direction left/right (not strafe), so what's in front of the camera after pressing D is
 * actually what you turned to face, the way looking around in a first-person view is expected to
 * work. Implemented by rotating the camera→target offset around the camera's own position (a
 * turn moves only the target, pivoting the view in place) and, for walking, translating both
 * camera and target together along that same flattened offset direction (so distance/pitch stay
 * exactly what the mouse last set them to — this never fights OrbitControls' own invariant that
 * the camera always looks at its target).
 */
export function CityWalkControls({ controlsRef, enabled }: Props) {
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!MOVE_KEYS.has(e.code)) return;
      // don't hijack WASD while the user is typing into some other field on the page (e.g. the
      // entity form panel sitting behind the canvas)
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      keysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    // dropping focus mid-press (alt-tab, clicking outside the window) would otherwise leave a key
    // "stuck" held forever since its keyup never fires
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    const keys = keysRef.current;
    if (!controls || !enabled || keys.size === 0) return;

    let turn = 0;
    if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= TURN_SPEED * delta;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += TURN_SPEED * delta;

    let walk = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) walk += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) walk -= 1;

    if (turn === 0 && walk === 0) return;

    // the camera→target offset carries the mouse-set distance and pitch — rotating it around the
    // camera's own position turns the view without moving anywhere; translating it (unchanged)
    // along with the camera is what "walking" means.
    const offset = new THREE.Vector3().subVectors(controls.target, camera.position);
    if (turn !== 0) offset.applyAxisAngle(UP, turn);

    if (walk !== 0) {
      const forwardFlat = new THREE.Vector3(offset.x, 0, offset.z).normalize();
      const move = forwardFlat.multiplyScalar(walk * WALK_SPEED * delta);
      camera.position.add(move);
    }

    // eased toward ground level, not snapped — the free-orbit camera starts at a bird's-eye
    // height, and pulling the camera itself down (not just moving it across x/z) is what actually
    // makes this read as walking *on* the terrain instead of panning a still-elevated view across
    // it.
    const groundY = getTerrainHeight(camera.position.x, camera.position.z) + EYE_HEIGHT;
    camera.position.y += (groundY - camera.position.y) * Math.min(1, HEIGHT_EASE * delta);

    // flatten the pitch in step with the height ease — otherwise `offset`'s own y stays whatever
    // steep bird's-eye angle the mouse last set, and carrying that same angle down to eye-height
    // means looking almost straight down at your own feet instead of ahead.
    const ease = Math.min(1, HEIGHT_EASE * delta);
    const horizontalDist = Math.hypot(offset.x, offset.z);
    offset.y += (horizontalDist * WALK_PITCH_TAN - offset.y) * ease;

    controls.target.copy(camera.position).add(offset);
    controls.update();
  });

  return null;
}
