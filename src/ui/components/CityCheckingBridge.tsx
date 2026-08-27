import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { getTerrainHeight } from '../../domain/terrain';

// world-space ground plane for ray intersection — same technique CityBuildingItem uses for its
// own drag.
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// screen pixels, not world units — a world-space threshold here would hit the exact same bug
// already fixed once in CityBuildingItem: the same real drag gesture crosses a fixed world-space
// distance easily when zoomed out but barely at all when zoomed in close, so a deliberate drag at
// closer zoom could silently fail to register and open the entity editor instead of moving the
// bridge.
const DRAG_THRESHOLD_PX = 6;

// a canvas-generated plate texture instead of one flat fill — a solid color on a low-poly box
// read as a paper cutout, not a deck with any real thickness to its own surface. A dark seam
// across the bottom of the tile plus a lighter highlight just above it fakes a beveled edge
// between plates, the same "not solid" instinct used everywhere else in this city (ground
// texture, water texture), just applied to a man-made surface instead of an organic one.
// Exactly ONE band per tile — the real plate spacing is controlled entirely by how many times
// this tile repeats (see PLATES_PER_UNIT below); baking several bands into the tile *and* also
// repeating it stacks both multipliers, which is what made an earlier pass's stripes so dense
// they blurred into a flat average color once minified at any real viewing distance.
function createDeckPlateTexture(baseColor: string): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  const base = new THREE.Color(baseColor);
  const seam = base.clone().multiplyScalar(0.45);
  const highlight = base.clone().lerp(new THREE.Color('#ffffff'), 0.55);

  ctx.fillStyle = `#${seam.getHexString()}`;
  ctx.fillRect(0, 0, w, h * 0.22);
  ctx.fillStyle = `#${highlight.getHexString()}`;
  ctx.fillRect(0, h * 0.22, w, h * 0.14);

  // rivets along the seam — bold enough to survive minification at typical camera distance.
  ctx.fillStyle = `#${seam.getHexString()}`;
  for (let rx = w * 0.14; rx < w; rx += w * 0.24) {
    ctx.beginPath();
    ctx.arc(rx, h * 0.11, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

interface Props {
  x: number;
  zNear: number;
  zFar: number;
  // '' hides these (respects hideAmounts, and availableLabel is also '' when there's nothing
  // actually earmarked) — the "עו״ש" name itself still always shows, the same way every other
  // district's own ground label does regardless of hideAmounts.
  amountLabel: string;
  availableLabel: string;
  // share of the total balance that's actually free for investment (balance minus the desired
  // minimum, see getCheckingAvailableForInvestment) — splits the deck's own surface into the same
  // two zones the numbers above already describe, instead of one flat color that says nothing
  // about the split. 0 when there's no balance to divide.
  availableRatio: number;
  // the checking district's own column bounds — dragging is confined to the same column width
  // every regular building's own drag already respects (see domain/city.ts's computeCellBounds),
  // not free reign across the whole city.
  minX: number;
  maxX: number;
  onMoveX: (x: number) => void;
  setControlsEnabled: (enabled: boolean) => void;
  onOpen: () => void;
}

// checking's own health color (see domain/health.ts) — used for the "פנוי להשקעה" text, which
// renders it flat/unlit and therefore exactly as authored.
const CHECKING_COLOR = '#2fb0a0';
// the rails and the wireframe outline draped over the whole deck are a different story: the
// wireframe's own overlapping semi-transparent lines and the rails' specular highlights under the
// scene's lights both push CHECKING_COLOR toward a visibly brighter, more cyan turquoise than the
// text ever shows — reducing just the rails' emissive intensity wasn't enough, since the outline
// (an unlit meshBasicMaterial) never had emissive to begin with. A pre-darkened structural variant
// keeps the same hue but lands back on the same muted teal once the wireframe/highlights lighten it.
const CHECKING_STRUCTURE_COLOR = '#1c7d70';
// the reserved/"don't touch" portion of the deck surface.
const RESERVED_COLOR = '#3a4a46';
// the available-for-investment portion — deliberately gold, not the same teal the rails already
// own. A first pass used teal for both, and with the rails sitting right on top of the available
// zone in the same hue, the two blended into one shapeless mass with no visible edge between
// "structure" and "surface." Gold is also this city's own established "money/value" color
// (income pipe, medal frames), so it doubles as "this cash is ready to move."
const AVAILABLE_COLOR = '#c2921f';
// how many plate-seams per world unit of deck length — keeps plate spacing visually consistent
// regardless of how long a given zone actually is, rather than always stretching one texture
// tile across the whole zone (which would make a short zone's plates look huge).
const PLATES_PER_UNIT = 0.8;
const DECK_WIDTH = 3.2;
const DECK_THICKNESS = 0.3;
const RAIL_HEIGHT = 0.5;
const RAIL_THICKNESS = 0.12;
// well clear of everything that might pass underneath — not just the income circuit tubes
// (CityIncomeLinks, top around terrainY+0.14) and the water/valley streams (CityGround, top up
// to terrainY+0.78), but high enough that the label hanging below the deck (see labelY) also
// clears them, instead of sitting at the same height where those pipes/streams tend to cross.
const DECK_CLEARANCE = 5.5;
const PILLAR_RADIUS = 0.16;

/**
 * A level deck spanning the depth-gap between the "short-term" and "immediate/liquid" tiers,
 * right where the checking district's own x column sits — checking money literally bridges the
 * gap between those two liquidity horizons, so the structure reads that same way. A real bridge
 * stays level even over uneven ground, so the deck's own Y is one flat height (the taller of its
 * two endpoints' terrain, plus clearance), not terrain-following like the tube geometries
 * elsewhere in this city. The deck's own surface is split along its length into the reserved
 * (desired minimum) and available-for-investment portions, painted directly onto the bridge
 * instead of only spelled out in the text above it.
 */
export function CityCheckingBridge({
  x: baseX,
  zNear,
  zFar,
  amountLabel,
  availableLabel,
  availableRatio,
  minX,
  maxX,
  onMoveX,
  setControlsEnabled,
  onOpen,
}: Props) {
  const [dragX, setDragX] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const activeRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; clientX: number; clientY: number } | null>(null);
  const x = dragX ?? baseX;

  const span = Math.abs(zFar - zNear);
  const centerZ = (zNear + zFar) / 2;
  const deckY = useMemo(
    () => Math.max(getTerrainHeight(x, zNear), getTerrainHeight(x, zFar)) + DECK_CLEARANCE,
    [x, zNear, zFar],
  );

  const clampedAvailable = Math.max(0, Math.min(1, availableRatio));
  const availableLen = clampedAvailable * span;
  const reservedLen = span - availableLen;
  // the near end (zNear) reads as "committed" first, same left-to-right-reads-as-a-timeline logic
  // as the budget tube's own bottom-to-top stack — reserved money anchors the bridge, available
  // money is the portion actually reaching toward the far tier.
  const reservedGeometry = useMemo(
    () => (reservedLen > 0.001 ? new THREE.BoxGeometry(DECK_WIDTH, DECK_THICKNESS, reservedLen) : null),
    [reservedLen],
  );
  const availableGeometry = useMemo(
    () => (availableLen > 0.001 ? new THREE.BoxGeometry(DECK_WIDTH, DECK_THICKNESS, availableLen) : null),
    [availableLen],
  );
  const outlineGeometry = useMemo(() => new THREE.BoxGeometry(DECK_WIDTH, DECK_THICKNESS, span), [span]);

  const reservedTexture = useMemo(() => {
    const t = createDeckPlateTexture(RESERVED_COLOR);
    t.repeat.set(1, Math.max(1, Math.round(reservedLen * PLATES_PER_UNIT)));
    return t;
  }, [reservedLen]);
  const availableTexture = useMemo(() => {
    const t = createDeckPlateTexture(AVAILABLE_COLOR);
    t.repeat.set(1, Math.max(1, Math.round(availableLen * PLATES_PER_UNIT)));
    return t;
  }, [availableLen]);

  const reservedCenterZ = zNear + Math.sign(zFar - zNear || 1) * (reservedLen / 2);
  const availableCenterZ = zNear + Math.sign(zFar - zNear || 1) * (reservedLen + availableLen / 2);

  const pillarZs = [zNear, centerZ, zFar];
  // clear of all three pillars (zNear/centerZ/zFar), not centered among them — hanging the label
  // at centerZ put it right behind the middle pillar, which then cut straight through the text.
  const labelZ = zFar + Math.sign(zFar - zNear || 1) * 1.6;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const point = new THREE.Vector3();
    dragStartRef.current = e.ray.intersectPlane(GROUND_PLANE, point)
      ? { pointerX: point.x, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY }
      : null;
    activeRef.current = true;
    draggingRef.current = false;
    setControlsEnabled(false);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!activeRef.current || !dragStartRef.current) return;
    const point = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND_PLANE, point)) return;
    if (!draggingRef.current) {
      const pixelDist = Math.hypot(e.nativeEvent.clientX - dragStartRef.current.clientX, e.nativeEvent.clientY - dragStartRef.current.clientY);
      if (pixelDist < DRAG_THRESHOLD_PX) return;
      draggingRef.current = true;
    }
    const dx = point.x - dragStartRef.current.pointerX;
    setDragX(Math.min(maxX, Math.max(minX, baseX + dx)));
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setControlsEnabled(true);
    activeRef.current = false;
    dragStartRef.current = null;
    if (draggingRef.current) {
      if (dragX !== null) onMoveX(dragX);
      setDragX(null);
    } else {
      onOpen();
    }
    draggingRef.current = false;
  };

  return (
    <group position={[x, 0, 0]}>
      {/* invisible, oversized hitbox owning the whole drag gesture — the visible meshes' own
          onClick (still wired below) would lose the pointer the instant the cursor moves off
          their exact geometry mid-drag. X-only: dragging is confined to sliding along the
          checking district's own column, not free movement across the city. */}
      <mesh
        position={[0, deckY, centerZ]}
        frustumCulled={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <boxGeometry args={[DECK_WIDTH * 1.3, DECK_THICKNESS + RAIL_HEIGHT + 0.4, span + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {reservedGeometry && (
        <mesh geometry={reservedGeometry} position={[0, deckY, reservedCenterZ]} frustumCulled={false} onClick={handleClick}>
          <meshStandardMaterial map={reservedTexture} flatShading roughness={0.75} />
        </mesh>
      )}
      {availableGeometry && (
        <mesh geometry={availableGeometry} position={[0, deckY, availableCenterZ]} frustumCulled={false} onClick={handleClick}>
          <meshStandardMaterial map={availableTexture} emissive={AVAILABLE_COLOR} emissiveIntensity={0.22} flatShading roughness={0.6} />
        </mesh>
      )}
      <mesh geometry={outlineGeometry} position={[0, deckY, centerZ]} frustumCulled={false}>
        <meshBasicMaterial color={CHECKING_STRUCTURE_COLOR} wireframe transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* low rails along both edges — same muted structural teal as the wireframe outline above,
          not the brighter text-matched CHECKING_COLOR (see CHECKING_STRUCTURE_COLOR's own
          comment). */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (DECK_WIDTH / 2 - RAIL_THICKNESS / 2), deckY + DECK_THICKNESS / 2 + RAIL_HEIGHT / 2, centerZ]}
          frustumCulled={false}
        >
          <boxGeometry args={[RAIL_THICKNESS, RAIL_HEIGHT, span]} />
          <meshStandardMaterial color={CHECKING_STRUCTURE_COLOR} emissive={CHECKING_STRUCTURE_COLOR} emissiveIntensity={0.14} roughness={0.4} />
        </mesh>
      ))}

      {/* support pillars at both ends and the middle, each dropped to its own local terrain
          height — only the deck itself stays flat; what holds it up still meets the real ground. */}
      {pillarZs.map((z) => {
        const terrainY = getTerrainHeight(x, z);
        const pillarHeight = deckY - DECK_THICKNESS / 2 - terrainY;
        if (pillarHeight <= 0) return null;
        return (
          <mesh key={z} position={[0, terrainY + pillarHeight / 2, z]} frustumCulled={false}>
            <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS * 1.3, pillarHeight, 8]} />
            <meshStandardMaterial color="#332e26" roughness={0.8} metalness={0.15} />
          </mesh>
        );
      })}

      {/* hanging below the deck, not floating above it — with the bridge raised well clear of
          the income tubes/water streams (see DECK_CLEARANCE), the open air underneath it is the
          one spot near this structure with nothing else passing through, so the label reads
          clean regardless of camera angle instead of competing with whatever's crossing above. */}
      {/* amount in gold above, name in white below — the same order and pairing every other
          building in the city uses (see CityBuildingMesh.tsx), not a reversed stack unique to
          this one. */}
      <Billboard position={[0, deckY - DECK_THICKNESS / 2 - 1.2, labelZ]}>
        {amountLabel !== '' && (
          <Text fontSize={0.58} color="#ffd166" anchorX="center" anchorY="top" outlineWidth={0.02} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {amountLabel}
          </Text>
        )}
        <Text position={[0, -0.8, 0]} fontSize={0.72} color="#f1f3f8" anchorX="center" anchorY="top" outlineWidth={0.03} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
          עו״ש
        </Text>
        {availableLabel !== '' && (
          <Text position={[0, -1.7, 0]} fontSize={0.54} color={CHECKING_COLOR} anchorX="center" anchorY="top" outlineWidth={0.022} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {availableLabel}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
