import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { CashRunway } from '../../domain/cashRunway';
import { HEALTH_COLORS } from '../../domain/health';
import { getFlowTexture } from './cityFlowTexture';
import { computeCheckingDeckY } from './cityCheckingLayout';
import { CityThickOutline } from './CityThickOutline';

interface Props {
  x: number;
  zNear: number;
  zFar: number;
  runway: CashRunway | null;
  hideAmounts: boolean;
  formatCurrency: (value: number) => string;
}

// a fixed physical strip, not one that stretches with however many days happen to be left until
// payday — a variable-length tube with a flat rise looked dead flat once payday was more than a
// few days out (a fixed few-unit rise over 70+ units of length is imperceptible). Fixed length +
// fixed rise instead reads as a real elevated landing approach every time: high in the distance,
// descending down into the bridge's own deck height, regardless of how many days are actually left.
const RUNWAY_LENGTH = 42;
const RISE_HEIGHT = 24;
// a real runway approach reads as an angled line, not one running dead straight backward from the
// bridge — this sweeps the far/high end sideways, curving back in to meet the bridge head-on.
// Negative — lower X reads as further *left* on screen in this RTL city's default camera framing
// (see CitySun's own x=width*0.78 comment for the same "higher x reads as further right"
// convention elsewhere), away from the income/insurance/debt cluster's own tangled connector lines
// that a positive sweep ran straight through. Kept modest (not the ±16 first tried) — swinging
// wide across the whole map's own X range instead crossed straight over the independence dome's
// own floating labels near the top; staying closer to checking's own column keeps the whole track
// over ground that's actually clear of other landmark UI, not just clear of the debt/insurance side.
// Nudged from -8 to -11 on request (2026-08-29) — still well short of the ±16 that was too wide.
const ANGLE_OFFSET = -11;
// the day-count "clock face" the whole fixed track represents — daysUntilPayday can never exceed
// roughly a month by construction (see domain/cashRunway.ts's projectNextOccurrence), so 31 is a
// safe upper bound: the plane and every beacon always land inside the track's own real length,
// never past its far end.
const MAX_DAYS = 31;
const TUBE_RADIUS = 0.28;
const TUBE_SEGMENTS = 64;
const PULSE_SPEED = 2;
const GOLD = '#ffd166';
// the same bright canopy green the savings sapling trees use (CityTreeMesh.tsx's own
// CANOPY_PALETTE.sapling.light) — a solid pale white read as flat/generic against the city's own
// palette; this ties the plane visually into the same "growth" green already meaningful elsewhere.
const PLANE_COLOR = '#8fd671';

/** Passed as every label Text's own `onSync` below to make it always draw on top of the tube,
 * instead of getting cut off wherever the tube's own opaque geometry happens to sit nearer the
 * camera at a given angle (see the first call site's own doc-comment for the full "why"). Setting
 * `material-depthTest={false}` directly as a JSX prop does *not* work here and silently does
 * nothing (confirmed 2026-08-29 — the fix built and deployed cleanly but had zero visual effect):
 * troika-three-text's own `Text.material` getter returns an *array* — `[outlineMaterial,
 * derivedMaterial]` — whenever `outlineWidth` is set (see hasOutline() in troika-three-text), which
 * every label in this file does for legibility. React Three Fiber's dash-prop mechanism then reads
 * that array back and sets a stray `.depthTest` property directly on the array object itself,
 * touching neither real material. `onSync` instead hands back the live troika mesh after each
 * (re)build, so both materials — whichever shape `.material` happens to be this time — get the
 * real, correct property set on them directly. */
function keepLabelOnTop(troika: { material: THREE.Material | THREE.Material[] }) {
  const materials = Array.isArray(troika.material) ? troika.material : [troika.material];
  for (const material of materials) material.depthTest = false;
}

/** ratio <= 0.5 → HEALTH_COLORS.risk, 1.0 → warning, >= 1.4 (the cap) → good — a continuous lerp
 * through the same three-color vocabulary the rest of the city already assigns meaning to (see
 * health.ts), rather than a fixed hex invented just for this. */
function colorForRatio(ratio: number): THREE.Color {
  const good = new THREE.Color(HEALTH_COLORS.good);
  const warning = new THREE.Color(HEALTH_COLORS.warning);
  const risk = new THREE.Color(HEALTH_COLORS.risk);
  if (ratio >= 1) return warning.clone().lerp(good, Math.min(1, (ratio - 1) / 0.4));
  return risk.clone().lerp(warning, Math.min(1, Math.max(0, (ratio - 0.5) / 0.5)));
}

// sized to actually read against a city where buildings/towers commonly run several units tall —
// the first pass (radius 0.22) was scaled like a beacon accent, not a vehicle meant to be the eye's
// main anchor on the whole runway, and got lost in the scene entirely.
const PLANE_SCALE = 4.5;
// floating clear above the tube's own surface, not sitting on/inside it — a plane parked exactly
// on the track read as embedded in the tube rather than flying an approach over it.
const PLANE_HEIGHT_ABOVE_TRACK = 2.6;

// dark, crisp contour lines on every piece — matching CityCheckingBridge.tsx's own EdgesGeometry
// technique (real edges/corners only, not a wireframe's diagonal face-split) — so the plane reads
// as a defined, faceted object instead of a flat solid-white silhouette with no shape definition.
const OUTLINE_COLOR = '#0a0c11';
const FUSELAGE_GEOMETRY = new THREE.BoxGeometry(0.16, 0.14, 1.4);
const FUSELAGE_EDGES = new THREE.EdgesGeometry(FUSELAGE_GEOMETRY);
const NOSE_GEOMETRY = new THREE.BoxGeometry(0.16, 0.14, 0.32);
const NOSE_EDGES = new THREE.EdgesGeometry(NOSE_GEOMETRY);
const WING_GEOMETRY = new THREE.BoxGeometry(2.3, 0.06, 0.5);
const WING_EDGES = new THREE.EdgesGeometry(WING_GEOMETRY);
const TAIL_GEOMETRY = new THREE.BoxGeometry(0.5, 0.12, 0.14);
const TAIL_EDGES = new THREE.EdgesGeometry(TAIL_GEOMETRY);

/** The "✈ glyph" — fuselage + wing crossbar + a gold nose tip — back after a plain paper-dart
 * silhouette read as an odd flat blob rather than a plane. The nose is a plain box, not a cone: a
 * 4-sided cone's own triangular cross-section reads as a flat diamond/kite shape from a lot of
 * camera angles (exactly what showed up once actually rendered — a stray gold rhombus stuck on the
 * side, not a pointed tip), where a box's own silhouette stays a predictable rectangle from any
 * angle. Its gold color (not pale, like the rest of the body) is what actually marks "this end is
 * the front" — the tail end (below) is a flat cap with nothing that could compete with it for
 * "which end looks like the front." Nose along local +Z — oriented by the caller via a wrapping
 * group's own quaternion (planeOrientation below, verified numerically), not baked in here. */
function PlaneMesh() {
  return (
    <group scale={PLANE_SCALE}>
      {/* fuselage */}
      <mesh geometry={FUSELAGE_GEOMETRY} frustumCulled={false}>
        <meshStandardMaterial color={PLANE_COLOR} emissive={PLANE_COLOR} emissiveIntensity={0.5} roughness={0.35} metalness={0.4} flatShading />
      </mesh>
      <CityThickOutline geometry={FUSELAGE_EDGES} color={OUTLINE_COLOR} linewidth={2.2} />
      {/* the nose tip — a plain box, narrower at increasing Z would need a custom taper, so instead
          it's simply gold and set slightly forward of the fuselage's own front face, reading as an
          unambiguous "this end" marker regardless of viewing angle. */}
      <mesh geometry={NOSE_GEOMETRY} position={[0, 0, 0.78]} frustumCulled={false}>
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.6} roughness={0.35} metalness={0.4} flatShading />
      </mesh>
      <CityThickOutline geometry={NOSE_EDGES} color={OUTLINE_COLOR} linewidth={2.2} position={[0, 0, 0.78]} />
      {/* main wing crossbar, close to the nose — nearer the front than the back, same as a real
          plane's own wing placement. */}
      <mesh geometry={WING_GEOMETRY} position={[0, 0, 0.2]} frustumCulled={false}>
        <meshStandardMaterial color={PLANE_COLOR} emissive={PLANE_COLOR} emissiveIntensity={0.4} roughness={0.4} metalness={0.3} flatShading />
      </mesh>
      <CityThickOutline geometry={WING_EDGES} color={OUTLINE_COLOR} linewidth={2.2} position={[0, 0, 0.2]} />
      {/* tail cap — flat, not pointed, so nothing back here competes with the nose for "front". */}
      <mesh geometry={TAIL_GEOMETRY} position={[0, 0, -0.66]} frustumCulled={false}>
        <meshStandardMaterial color={PLANE_COLOR} emissive={PLANE_COLOR} emissiveIntensity={0.35} roughness={0.4} metalness={0.3} flatShading />
      </mesh>
      <CityThickOutline geometry={TAIL_EDGES} color={OUTLINE_COLOR} linewidth={2.2} position={[0, 0, -0.66]} />
    </group>
  );
}

/**
 * A fixed-length glowing landing approach extending back from the checking bridge's far edge —
 * high in the distance, descending down into the bridge's own deck — with a small plane on it
 * whose position along the track is literally "how many days are left until the next payday"
 * (see MAX_DAYS): it advances toward the bridge every day and arrives exactly on payday. Upcoming
 * bills (see domain/cashRunway.ts) sit ahead of the plane, between it and the bridge, each at the
 * point that represents its own real projected date. The whole track's color says at a glance
 * whether checking is comfortably ahead of what's still due (green), thinning (amber), or already
 * short (red). Renders nothing when `runway` is null — no linked/manually-dated income entity
 * means there's no real payday to anchor any of this to.
 */
export function CityCashRunway({ x, zNear, zFar, runway, hideAmounts, formatCurrency }: Props) {
  const startY = computeCheckingDeckY(x, zNear, zFar);

  // anchored at zNear, extending toward even smaller Z — not zFar extending toward larger Z. The
  // camera sits well past zFar looking back toward zNear/negative Z (see CityView's own
  // initialCameraPosition, z = maxDepthZ + 46), so a runway built the other way around put its own
  // "far, high" end *closer* to the camera than the bridge itself — the descent read as happening
  // on the viewer's own side instead of receding into the distance. This way the whole track sits
  // behind the bridge from the camera's point of view: high and far in the actual depth of the
  // scene, sloping down into the bridge as the plane (see planePoint below) approaches.
  //
  // climbs fast right after the bridge and holds near cruise altitude for most of its length,
  // rather than rising smoothly the whole way — a smooth rise stayed at ordinary building height
  // through the busy middle stretch of the map, weaving visibly through whatever content happened
  // to sit under it there. Spending most of the track well above typical building height (see
  // domain/city.ts's MAX_HEIGHT) keeps it reading as a flight path passing *over* the city instead
  // of a line drawn through it, regardless of which districts happen to be underneath.
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, startY, zNear),
        new THREE.Vector3(ANGLE_OFFSET * 0.55, startY + RISE_HEIGHT * 0.82, zNear - RUNWAY_LENGTH * 0.14),
        new THREE.Vector3(ANGLE_OFFSET * 0.95, startY + RISE_HEIGHT * 0.97, zNear - RUNWAY_LENGTH * 0.85),
        new THREE.Vector3(ANGLE_OFFSET, startY + RISE_HEIGHT, zNear - RUNWAY_LENGTH),
      ]),
    [startY, zNear],
  );

  // TubeGeometry's own u=0 sits at the curve's start (the bridge, t=0) and u=1 at its end (the far
  // point) — same convention CityGround's water/valley streams use, where their shared flow
  // texture's offset always animates from low u toward high u (see that file's own comment on why
  // it subtracts, not adds). For a stream that's the right direction (source → destination). Here
  // it's backward: the same shared animation would carry the glow from the bridge *out* toward the
  // far end, reading as the runway launching away rather than an approach flowing in. This one
  // tube's own UV is flipped (not the shared texture/animation itself, which every other stream in
  // the city also depends on) so the identical global animation reads as flowing from the far end
  // in toward the bridge instead.
  const tubeGeometry = useMemo(() => {
    const geometry = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, TUBE_RADIUS, 8, false);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    uv.needsUpdate = true;
    return geometry;
  }, [curve]);
  const flowTexture = getFlowTexture();
  const color = useMemo(() => (runway ? colorForRatio(runway.ratio) : null), [runway]);

  // real target — never animated itself, just where the plane (see the intro animation below) and
  // the countdown label (which doesn't animate at all, see its own render below) both settle.
  const planeT = runway ? Math.min(1, Math.max(0, runway.daysUntilPayday / MAX_DAYS)) : 0;

  const planeGroupRef = useRef<THREE.Group>(null);
  // null until the first frame actually runs — clock.elapsedTime at THAT moment is the real "page
  // load" reference point the intro animates from, not 0 (which would be off by however long React
  // itself took to first mount this component).
  const introStartRef = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!planeGroupRef.current || !runway) return;
    if (introStartRef.current === null) introStartRef.current = clock.elapsedTime;
    // a one-time "landing approach" on page load — the plane starts at the runway's own far end
    // (t=1) and eases in to its real current-day position over INTRO_DURATION seconds, instead of
    // just appearing already parked where the day count says it should be. Position/orientation are
    // set imperatively here (not via JSX position/quaternion props on the group below) precisely so
    // this can animate every frame during the intro without fighting React's own re-renders, which
    // happen far more often than once and would otherwise snap the plane straight back to its
    // resting spot on the very next unrelated board update.
    const INTRO_DURATION = 2.4;
    const rawProgress = Math.min(1, (clock.elapsedTime - introStartRef.current) / INTRO_DURATION);
    const eased = 1 - (1 - rawProgress) ** 3; // ease-out cubic — fast start, gentle touchdown
    const animatedT = THREE.MathUtils.lerp(1, planeT, eased);

    const point = curve.getPointAt(animatedT);
    // same "ahead point, verified via setFromUnitVectors" approach as the resting orientation
    // below — kept in sync deliberately rather than factored out, since the two run in genuinely
    // different contexts (per-frame imperative vs. once-per-render declarative).
    const ahead = curve.getPointAt(Math.max(0, animatedT - 0.03));
    const direction = ahead.clone().sub(point).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

    // a gentle bob/sway on top of the real position — a fixed bounded oscillation, not an earlier
    // version's own unbounded `position.y +=` every frame, which drifted further off over time
    // instead of settling into a real repeating sway.
    const bob = Math.sin(clock.elapsedTime * 1.4) * 0.15;
    planeGroupRef.current.position.set(point.x, point.y + PLANE_HEIGHT_ABOVE_TRACK + bob, point.z);
    planeGroupRef.current.quaternion.copy(orientation);
  });

  if (!runway || !color) return null;

  // the plane mesh's own real per-frame position/orientation come entirely from the imperative
  // animation above (see planeGroupRef/introStartRef) — this is only the resting point everything
  // else that doesn't animate (the countdown label below) anchors itself to.
  const planePoint = curve.getPointAt(planeT);

  const beacons = runway.upcomingCharges.map((charge) => {
    const t = Math.min(1, Math.max(0, (runway.daysUntilPayday - charge.daysFromToday) / MAX_DAYS));
    return { charge, point: curve.getPointAt(t) };
  });

  const arrivalPoint = curve.getPointAt(0);

  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={tubeGeometry} frustumCulled={false}>
        <meshStandardMaterial
          map={flowTexture}
          emissiveMap={flowTexture}
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* no position/quaternion props here — both are driven imperatively every frame by the
          landing-intro animation above (planeGroupRef), which would otherwise fight React's own
          re-renders snapping these back to the static resting values on every unrelated board
          update. */}
      <group ref={planeGroupRef}>
        <PlaneMesh />
      </group>
      {/* the countdown label — a sibling of the oriented plane group above, not nested inside it,
          positioned in the runway's own fixed local space rather than the plane's own (which
          rotates as it descends) — an offset nested inside the rotated group would drift wherever
          the plane's current heading happens to point it, not reliably off to the side on screen.
          Shifted right (+X) so it clears the plane's own wingspan instead of sitting right on top
          of the body. */}
      <Billboard position={[planePoint.x + 4.2, planePoint.y + PLANE_HEIGHT_ABOVE_TRACK + 2.6, planePoint.z]}>
        {/* keepLabelOnTop (see its own doc-comment) applied to every label in this file (see also
            the beacon/arrival labels below) — these are informational overlays pinned to a point on
            the tube's own surface, meant to always read clearly, not physical objects that should
            get hidden behind the tube's own solid (non-transparent) geometry. Without it, a low/
            shallow camera angle down the runway's own length puts part of the tube nearer the
            camera than a label further along the curve, and the tube — opaque, so it renders (and
            writes depth) before the transparent text pass — wins the depth test and eats the text
            (reported 2026-08-29, screenshot showed several beacon labels cut off mid-word behind
            the green tube). */}
        <Text
          fontSize={0.78}
          color={GOLD}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="#0a0c11"
          fontWeight="bold"
          frustumCulled={false}
          onSync={keepLabelOnTop}
          renderOrder={10}
        >
          {runway.daysUntilPayday === 0 ? 'היום!' : `עוד ${runway.daysUntilPayday} ימים למשכורת`}
        </Text>
        {!hideAmounts && (
          <Text
            position={[0, -0.16, 0]}
            fontSize={0.62}
            color="#f1f3f8"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.024}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
            onSync={keepLabelOnTop}
            renderOrder={10}
          >
            {`צריך ${formatCurrency(runway.recommendedBalance)} פנוי בעו"ש`}
          </Text>
        )}
      </Billboard>

      {beacons.map(({ charge, point }) => (
        <group key={charge.entityId} position={[point.x, point.y, point.z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
            <torusGeometry args={[0.4, 0.055, 8, 24]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.5} roughness={0.4} metalness={0.2} />
          </mesh>
          <Billboard position={[0, -0.85, 0]}>
            {!hideAmounts && (
              <Text
                fontSize={0.36}
                color={GOLD}
                anchorX="center"
                anchorY="top"
                outlineWidth={0.015}
                outlineColor="#0a0c11"
                fontWeight="bold"
                frustumCulled={false}
                onSync={keepLabelOnTop}
                renderOrder={10}
              >
                {formatCurrency(charge.amount)}
              </Text>
            )}
            <Text
              position={[0, hideAmounts ? 0 : -0.46, 0]}
              fontSize={0.34}
              color="#f1f3f8"
              anchorX="center"
              anchorY="top"
              outlineWidth={0.02}
              outlineColor="#0a0c11"
              fontWeight="bold"
              frustumCulled={false}
              onSync={keepLabelOnTop}
              renderOrder={10}
            >
              {`${charge.label} · ${charge.date.getDate()}/${charge.date.getMonth() + 1}`}
            </Text>
          </Billboard>
        </group>
      ))}

      {/* the arrival marker, right where the track meets the bridge — gently pulsing (see
          CityRiskAura.tsx's own sine pulse) so "this is where the plane lands" reads clearly even
          before checking the plane's own countdown label. */}
      <ArrivalMarker point={arrivalPoint} runway={runway} hideAmounts={hideAmounts} formatCurrency={formatCurrency} />
    </group>
  );
}

function ArrivalMarker({
  point,
  runway,
  hideAmounts,
  formatCurrency,
}: {
  point: THREE.Vector3;
  runway: CashRunway;
  hideAmounts: boolean;
  formatCurrency: (value: number) => string;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const pulse = (Math.sin(clock.elapsedTime * PULSE_SPEED) + 1) / 2;
    ringRef.current.scale.setScalar(1 + pulse * 0.2);
  });

  return (
    <group position={[point.x, point.y, point.z]}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[0.62, 0.05, 8, 28]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.7} roughness={0.3} metalness={0.3} />
      </mesh>
      <Billboard position={[0, 1.1, 0]}>
        <Text
          fontSize={0.4}
          color={GOLD}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.016}
          outlineColor="#0a0c11"
          fontWeight="bold"
          frustumCulled={false}
          onSync={keepLabelOnTop}
          renderOrder={10}
        >
          {`משכורת הבאה · ${runway.nextPaydayDate.getDate()}/${runway.nextPaydayDate.getMonth() + 1}`}
        </Text>
        {!hideAmounts && (
          <Text
            position={[0, -0.46, 0]}
            fontSize={0.3}
            color="#f1f3f8"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.014}
            outlineColor="#0a0c11"
            frustumCulled={false}
            onSync={keepLabelOnTop}
            renderOrder={10}
          >
            {`יתרה מומלצת: ${formatCurrency(runway.recommendedBalance)}`}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
