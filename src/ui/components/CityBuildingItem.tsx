import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useBoardStore } from '../../app/boardStore';
import { type CityBuilding, type CityPosition, snapCityPosition } from '../../domain/city';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  building: CityBuilding;
  /** Builds the actual visible mesh at the given absolute world x/z — kept as a factory so this
   * component doesn't need to know about every category's mesh variant. The third argument is a
   * guarded `onOpen` (see DRAG_RELEASE_GUARD_MS below) that every inner mesh's own onClick should
   * use instead of closing over its own `onOpen` — the mesh's own onClick fires from React Three
   * Fiber's own independent raycast-based synthetic click system, which isn't aware of the pointer
   * capture this wrapper uses for its drag gesture, so it can fire *in addition to*, not instead
   * of, this wrapper's own (correctly drag-aware) click handling. */
  renderMesh: (x: number, z: number, onOpen: () => void) => React.ReactNode;
  onOpen: () => void;
  setControlsEnabled: (enabled: boolean) => void;
}

// Terrain is flat (AMPLITUDE=0 in domain/terrain.ts) in practice today, but this still asks for
// "the ground" rather than hardcoding y=0, so a future non-flat terrain wouldn't need this file
// touched again.
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// Below this, a press-and-release still counts as "open the entity", not "moved it by accident" —
// measured in screen pixels, not world units. A world-space threshold here used to mean the same
// deliberate drag gesture could cross it easily when zoomed out (a small mouse movement covers
// many world units at a distant camera) but never cross it when zoomed in close (the same
// movement covers very few world units) — so a real drag at closer zoom would silently fail to
// register as a drag at all, and releasing it popped the edit panel open instead of moving the
// building. Screen pixels stay perceptually consistent regardless of camera distance.
const DRAG_THRESHOLD_PX = 6;
// This wrapper's own onPointerUp already correctly tells a drag-release apart from a real click
// (via draggingRef) and skips calling onOpen for a release — but the *inner* mesh (the tree
// trunk, the tower, whatever renderMesh actually returns) has its own onClick wired directly to
// onOpen too, for when it's clicked without ever going through this wrapper's hitbox at all (e.g.
// a canopy or a wide roof poking past the hitbox's own padded bounds). That inner onClick fires
// through React Three Fiber's own independent raycast-based synthetic click system, which has no
// idea a drag was just happening on this wrapper's hitbox — so a drag that ends with the pointer
// sitting over the inner mesh's own geometry can still pop the edit panel open via that separate
// path, even though this wrapper's own logic correctly declined to. A short cooldown after a real
// drag-release swallows that stray click without needing the inner mesh to know anything about
// dragging at all.
const DRAG_RELEASE_GUARD_MS = 300;
const TOUCH_QUERY = '(pointer: coarse)';

// A touch device has no way to tell "orbit the camera" and "drag this building" apart from a
// single finger alone — both start as one pointer moving across the same spot. Rather than fight
// that ambiguity, dragging is a mouse-only feature; a coarse (touch) pointer falls back to plain
// tap-to-open, same as before this feature existed, and leaves OrbitControls' own touch gestures
// (orbit/pinch-zoom/pan) completely uncontested.
function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia(TOUCH_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(TOUCH_QUERY);
    const onChange = () => setIsTouch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isTouch;
}

/**
 * Wraps one city building with an invisible, generously-oversized hit-box that owns pointer
 * capture for the whole drag gesture — the visible mesh's own onClick (still wired for a plain
 * click) would lose the pointer the instant the cursor moves off its exact geometry mid-drag.
 * Dragging is confined to the building's own category/depth cell (`building.cellBounds`,
 * computed in domain/city.ts) and snaps to the same LOT_SIZE grid the auto-layout itself uses, so
 * a manually placed building still lines up with its neighbors instead of landing at an arbitrary
 * offset.
 */
export function CityBuildingItem({ building, renderMesh, onOpen, setControlsEnabled }: Props) {
  const isTouch = useIsTouchDevice();
  const setCityPosition = useBoardStore((s) => s.setCityPosition);
  const [dragPos, setDragPos] = useState<CityPosition | null>(null);
  const draggingRef = useRef(false);
  const activeRef = useRef(false);
  // a timestamp (not a plain boolean) so a real drag that happens to finish, then get followed
  // very quickly by a genuine new click, doesn't accidentally swallow that next click too — the
  // guard only actually blocks calls made within DRAG_RELEASE_GUARD_MS of the drag's own release.
  const dragReleasedAtRef = useRef(0);
  // where the pointer itself first hit the ground, not the building's own center — a click
  // rarely lands exactly on-center (the hitbox is deliberately oversized), so driving the drag
  // position straight off the raw pointer position snapped the building to wherever the pointer
  // happened to be the instant the threshold was crossed. Tracking the pointer's own start and
  // moving the building by the same *delta* the pointer has since traveled keeps whatever offset
  // was clicked, so the building follows the cursor smoothly instead of jumping to meet it.
  const dragStartRef = useRef<{ pointerX: number; pointerZ: number; clientX: number; clientY: number } | null>(null);

  const terrainYTouch = getTerrainHeight(building.x, building.z);
  if (isTouch) {
    return <group position={[0, terrainYTouch, 0]}>{renderMesh(building.x, building.z, onOpen)}</group>;
  }

  const displayX = dragPos?.x ?? building.x;
  const displayZ = dragPos?.z ?? building.z;
  // the cell is always symmetric around its own center in x, and its z max edge is exactly the
  // tier's front line — see computeCellBounds in domain/city.ts — so the snap-grid's anchor point
  // is derivable straight from the bounds without needing the entity's un-overridden auto slot.
  const baseX = (building.cellBounds.minX + building.cellBounds.maxX) / 2;
  const baseZ = building.cellBounds.maxZ;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const point = new THREE.Vector3();
    dragStartRef.current = e.ray.intersectPlane(GROUND_PLANE, point)
      ? { pointerX: point.x, pointerZ: point.z, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY }
      : null;
    activeRef.current = true;
    draggingRef.current = false;
    setControlsEnabled(false);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!activeRef.current || !dragStartRef.current) return;
    const point = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND_PLANE, point)) return;
    const dx = point.x - dragStartRef.current.pointerX;
    const dz = point.z - dragStartRef.current.pointerZ;
    if (!draggingRef.current) {
      const pixelDist = Math.hypot(e.nativeEvent.clientX - dragStartRef.current.clientX, e.nativeEvent.clientY - dragStartRef.current.clientY);
      if (pixelDist < DRAG_THRESHOLD_PX) return;
      draggingRef.current = true;
    }
    setDragPos(snapCityPosition(building.x + dx, building.z + dz, baseX, baseZ, building.cellBounds));
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setControlsEnabled(true);
    activeRef.current = false;
    dragStartRef.current = null;
    if (draggingRef.current) {
      if (dragPos) setCityPosition(building.id, dragPos);
      setDragPos(null);
      dragReleasedAtRef.current = performance.now();
    } else {
      onOpen();
    }
    draggingRef.current = false;
  };

  const guardedOnOpen = () => {
    if (performance.now() - dragReleasedAtRef.current < DRAG_RELEASE_GUARD_MS) return;
    onOpen();
  };

  const terrainY = getTerrainHeight(displayX, displayZ);
  const hitHeight = building.height + 2;
  // padded for a forgiving click target, but not so much that two buildings a normal LOT_SIZE
  // apart end up with overlapping hitboxes — 1.4x let a click near a shared edge grab the wrong
  // neighbor instead of the one actually under the cursor.
  const hitFootprint = building.footprint * 1.15;

  return (
    <group position={[0, terrainY, 0]}>
      <mesh
        position={[displayX, hitHeight / 2, displayZ]}
        frustumCulled={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        // the browser still fires a native click on mouseup regardless of movement in between —
        // this hitbox already decided open-vs-move itself in handlePointerUp, so that later click
        // must be swallowed here or it falls through to the real mesh's own onClick underneath.
        onClick={(e) => e.stopPropagation()}
      >
        <boxGeometry args={[hitFootprint, hitHeight, hitFootprint]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {renderMesh(displayX, displayZ, guardedOnOpen)}
    </group>
  );
}
