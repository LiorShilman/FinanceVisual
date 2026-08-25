import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useBoardStore } from '../../app/boardStore';
import { type CityBuilding, type CityPosition, snapCityPosition } from '../../domain/city';
import { getTerrainHeight } from '../../domain/terrain';

interface Props {
  building: CityBuilding;
  /** Builds the actual visible mesh at the given absolute world x/z — kept as a factory so this
   * component doesn't need to know about every category's mesh variant. */
  renderMesh: (x: number, z: number) => React.ReactNode;
  onOpen: () => void;
  setControlsEnabled: (enabled: boolean) => void;
}

// Terrain is flat (AMPLITUDE=0 in domain/terrain.ts) in practice today, but this still asks for
// "the ground" rather than hardcoding y=0, so a future non-flat terrain wouldn't need this file
// touched again.
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// Below this, a press-and-release still counts as "open the entity", not "moved it by accident".
const DRAG_THRESHOLD = 0.15;
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
  // where the pointer itself first hit the ground, not the building's own center — a click
  // rarely lands exactly on-center (the hitbox is deliberately oversized), so driving the drag
  // position straight off the raw pointer position snapped the building to wherever the pointer
  // happened to be the instant the threshold was crossed. Tracking the pointer's own start and
  // moving the building by the same *delta* the pointer has since traveled keeps whatever offset
  // was clicked, so the building follows the cursor smoothly instead of jumping to meet it.
  const dragStartRef = useRef<{ pointerX: number; pointerZ: number } | null>(null);

  const terrainYTouch = getTerrainHeight(building.x, building.z);
  if (isTouch) {
    return <group position={[0, terrainYTouch, 0]}>{renderMesh(building.x, building.z)}</group>;
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
    dragStartRef.current = e.ray.intersectPlane(GROUND_PLANE, point) ? { pointerX: point.x, pointerZ: point.z } : null;
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
      if (Math.hypot(dx, dz) < DRAG_THRESHOLD) return;
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
    } else {
      onOpen();
    }
    draggingRef.current = false;
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
      {renderMesh(displayX, displayZ)}
    </group>
  );
}
