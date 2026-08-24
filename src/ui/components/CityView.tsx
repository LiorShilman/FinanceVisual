import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Billboard, OrbitControls, Text } from '@react-three/drei';
import { useBoardStore } from '../../app/boardStore';
import type { MonthHistoryPoint } from '../../app/riseupHistory';
import { computeCityAtmosphere } from '../../domain/atmosphere';
import { computeCityLayout, depthBaseZ, depthIndex, DISTRICT_SPACING } from '../../domain/city';
import { computeGroundBounds, type CircularExtent } from '../../domain/cityGrid';
import { computeDebtLinkPaths } from '../../domain/debtLinks';
import { CATEGORY_LABELS, ENTITY_CATEGORIES, getWeight, type FinancialEntity } from '../../domain/entity';
import type { FamilyMember } from '../../domain/familyMember';
import { computeIncomeLinkPaths } from '../../domain/incomeLinks';
import { computeNetWorthBreakdown } from '../../domain/netWorth';
import { getTerrainHeight } from '../../domain/terrain';
import { computeValleyFeature } from '../../domain/valley';
import { computeWaterFeature } from '../../domain/water';
import { formatCurrency } from '../format';
import { CityBuildingItem } from './CityBuildingItem';
import { CityBuildingMesh } from './CityBuildingMesh';
import { CityCrystalMesh } from './CityCrystalMesh';
import { CityDebtChains } from './CityDebtChains';
import { CityExpenseMesh } from './CityExpenseMesh';
import { CityFamilyAvatar } from './CityFamilyAvatar';
import { CityGiftMesh } from './CityGiftMesh';
import { CityGoalMesh } from './CityGoalMesh';
import { CityGround } from './CityGround';
import { CityHouseMesh } from './CityHouseMesh';
import { CityIncomeFaucet } from './CityIncomeFaucet';
import { CityIncomeLinks } from './CityIncomeLinks';
import { CityRiskAura } from './CityRiskAura';
import { CityRiseupMismatchBadge } from './CityRiseupMismatchBadge';
import { CityRiseupTrend } from './CityRiseupTrend';
import { CityShieldMesh } from './CityShieldMesh';
import { CitySun } from './CitySun';

interface Props {
  entities: FinancialEntity[];
  familyMembers: FamilyMember[];
  // entities whose linked RiseUp field (see domain/entity.ts's riseupLink) doesn't match this
  // month's real total — drives the floating "?" badge, computed once in BoardScreen rather than
  // duplicating the fetch/compare here.
  riseupMismatchIds: Set<string>;
  // last few months of real RiseUp totals, oldest first — drives the in-city trend chart; empty
  // when disconnected or still loading, which just skips rendering it.
  riseupHistory: MonthHistoryPoint[];
  onOpen: (id: string) => void;
}

// index 0 (locked/long-term) sits farthest from the camera, index 2 (liquid/current) nearest —
// matching domain/city.ts's depthIndex. Color follows the same long→short intuition as the rest
// of the app's health colors: green for the far, patient end; red for the near, immediate one.
const DEPTH_LABELS: { text: string; color: string }[] = [
  { text: 'נעול / טווח ארוך', color: '#5fd68f' },
  { text: 'טווח קצר', color: '#f0a95a' },
  { text: 'נזיל / שוטף', color: '#ee6b6b' },
];

// only the actual growth/savings vehicles — not debt, goals, checking, etc. — even though those
// share the same depth tiers. Showing "how much is actually growing at this horizon" is the point;
// mixing in liabilities or a checking balance would make the number meaningless.
const GROWTH_ASSET_KINDS = new Set(['savings', 'investment', 'pension', 'studyFund']);

export function CityView({ entities, familyMembers, riseupMismatchIds, riseupHistory, onOpen }: Props) {
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const usdRate = useBoardStore((s) => s.usdRate);
  const cityPositions = useBoardStore((s) => s.cityPositions);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const buildings = useMemo(() => computeCityLayout(entities, cityPositions), [entities, cityPositions]);
  const water = useMemo(() => computeWaterFeature(buildings), [buildings]);
  const valley = useMemo(() => computeValleyFeature(buildings, entities), [buildings, entities]);
  const netWorth = useMemo(() => computeNetWorthBreakdown(entities), [entities]);
  const atmosphere = useMemo(() => computeCityAtmosphere(buildings, netWorth), [buildings, netWorth]);
  const incomeLinkPaths = useMemo(() => computeIncomeLinkPaths(buildings, entities), [buildings, entities]);
  const debtLinkPaths = useMemo(() => computeDebtLinkPaths(buildings, entities), [buildings, entities]);
  const debtPositions = useMemo(
    () => buildings.filter((b) => b.category === 'debt').map((b): [number, number] => [b.x, b.z]),
    [buildings],
  );
  // per-depth-tier total of just the growth assets (savings/investment/pension/studyFund) sitting
  // at that horizon — shown next to each depth label, alongside its existing "which tier is this"
  // role.
  const growthTotalByDepth = useMemo(() => {
    const totals = [0, 0, 0];
    for (const e of entities) {
      if (!GROWTH_ASSET_KINDS.has(e.details.kind)) continue;
      totals[depthIndex(e)] = (totals[depthIndex(e)] ?? 0) + getWeight(e);
    }
    return totals;
  }, [entities]);
  const incomeFaucetTarget = useMemo(() => {
    const incomeBuildings = buildings.filter((b) => b.category === 'income');
    if (incomeBuildings.length === 0) return null;
    const x = incomeBuildings.reduce((sum, b) => sum + b.x, 0) / incomeBuildings.length;
    const z = incomeBuildings.reduce((sum, b) => sum + b.z, 0) / incomeBuildings.length;
    // the tallest rooftop's absolute height — the building itself now sits at its own terrain
    // height, so the target has to add that back in too, or droplets land too high/low relative
    // to a building that's actually standing on a hill or in a dip.
    const y = getTerrainHeight(x, z) + Math.max(...incomeBuildings.map((b) => b.height));
    return { x, z, y };
  }, [buildings]);
  // one avatar per family member, hovering above the centroid of the buildings they own — not
  // one per owned entity, which would clutter the city fast for anyone owning several things.
  // Members who own nothing yet (or aren't tied to any entity) render no avatar at all.
  const familyAvatarTargets = useMemo(() => {
    return familyMembers
      .map((m) => {
        const owned = buildings.filter((b) => entities.find((e) => e.id === b.id)?.ownerIds.includes(m.id));
        if (owned.length === 0) return null;
        const x = owned.reduce((sum, b) => sum + b.x, 0) / owned.length;
        const z = owned.reduce((sum, b) => sum + b.z, 0) / owned.length;
        // clears the tallest owned building's own name/amount billboard (which tops out around
        // height + 1.5, see CityBuildingMesh/CityGoalMesh), so the avatar floats visibly above it
        // instead of overlapping the text.
        const y = getTerrainHeight(x, z) + Math.max(...owned.map((b) => b.height)) + 2.3;
        return { id: m.id, name: m.name, photoUrl: m.photoUrl, x, z, y };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }, [familyMembers, buildings, entities]);
  // an empty category still owns a column of ground, but labeling a district that holds nothing
  // just reads as clutter — the pyramid already skips empty tiers the same way.
  const populatedCategories = useMemo(() => new Set(buildings.map((b) => b.category)), [buildings]);
  const hasDonations = populatedCategories.has('donation');
  const width = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
  // one extra row of depth when donations exist — their dedicated foreground lane past every
  // other category's nearest row (see domain/city.ts's depthIndex). minDepthZ comes from the same
  // depthBaseZ used to place buildings — locked/long-term sits an extra gap further back than the
  // other tiers, so the near/far framing below has to reach that far too, not just to z=0.
  const minDepthZ = depthBaseZ(0);
  const maxDepthZ = depthBaseZ(hasDonations ? 3 : 2);
  const depthSpan = maxDepthZ - minDepthZ;
  const groundSize = Math.max(width, depthSpan) + 20;
  const groundCenter: [number, number] = [width / 2, (minDepthZ + maxDepthZ) / 2];
  // the grid has to cover exactly what the textured ground plane covers — the lake and the valley
  // both sit right at (and past) the district square's own corners, so a grid sized to the
  // district alone would stop short of them.
  const bounds = computeGroundBounds(groundCenter, groundSize, [
    { center: water.lakeCenter, radius: water.outerRingRadius } satisfies CircularExtent,
    { center: valley.center, radius: valley.radius } satisfies CircularExtent,
  ]);
  const gridDivisions = Math.round(Math.max(bounds.width, bounds.depth) / 1.6);

  return (
    <Canvas camera={{ position: [width * 0.25, 36, maxDepthZ + 46], fov: 32 }} dir="rtl">
      {/* background/fog/ambient all come from computeCityAtmosphere — a healthy board renders
          these exact fixed values (fog pushed out past the raised maxDistance=200, so it stays
          lit well past normal viewing range); the more of the city reads as at-risk, the further
          they drift toward a dim, hazy red "weather", entirely driven by real board data, not a
          decorative toggle. */}
      <color attach="background" args={[atmosphere.background]} />
      <fog attach="fog" args={[atmosphere.background, atmosphere.fogNear, atmosphere.fogFar]} />
      <ambientLight intensity={atmosphere.ambientIntensity} color={atmosphere.ambientColor} />
      <directionalLight position={[width * 0.4, 26, 14]} intensity={2.6} />
      <directionalLight position={[-10, 14, -10]} intensity={0.85} color="#6c8dff" />

      <CityGround groundCenter={groundCenter} groundSize={groundSize} water={water} valley={valley} />
      <gridHelper
        args={[1, gridDivisions, '#4a5a7a', '#2e3648']}
        scale={[bounds.width, 1, bounds.depth]}
        position={[bounds.center[0], 0, bounds.center[1]]}
        frustumCulled={false}
      />
      {/* off to one side, not dead-center over the district — anchored to the camera-relative
          frame (width/depth) rather than the valley's own far-corner position, which left almost
          no headroom to raise it without pushing it straight out of the frustum's edge. */}
      <CitySun x={width * 0.68} y={19} z={maxDepthZ * 0.35} breakdown={hideAmounts ? null : netWorth} />
      {/* a few units to the right of the depth-tier labels' own column (x=-4.6 — "right" meaning
          toward higher x, since categories read right-to-left in this RTL city), centered in z
          between the long-term and short-term tiers specifically (not the full long-to-current
          span) — off to the side of the actual district instead of near the sun, where it sat
          right in the main view and competed with it. */}
      {!hideAmounts && (
        <CityRiseupTrend x={1.8} z={(depthBaseZ(0) + depthBaseZ(1)) / 2} history={riseupHistory} />
      )}
      <CityIncomeLinks paths={incomeLinkPaths} />
      <CityDebtChains debtPositions={debtPositions} linkPaths={debtLinkPaths} />
      {incomeFaucetTarget && (
        <CityIncomeFaucet targetX={incomeFaucetTarget.x} targetZ={incomeFaucetTarget.z} targetY={incomeFaucetTarget.y} />
      )}

      {ENTITY_CATEGORIES.filter((cat) => populatedCategories.has(cat)).map((cat) => (
        <Billboard
          key={cat}
          position={[(ENTITY_CATEGORIES.length - 1 - ENTITY_CATEGORIES.indexOf(cat)) * DISTRICT_SPACING, 1.5, maxDepthZ + 6.5]}
        >
          <Text
            fontSize={0.72}
            color="#f1f3f8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
          >
            {CATEGORY_LABELS[cat]}
          </Text>
        </Billboard>
      ))}

      {DEPTH_LABELS.map((label, i) => (
        <Billboard key={label.text} position={[-4.6, 1.4, depthBaseZ(i)]}>
          <Text
            fontSize={0.72}
            color={label.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#0a0c11"
            fontWeight="bold"
            frustumCulled={false}
          >
            {label.text}
          </Text>
          {!hideAmounts && growthTotalByDepth[i] > 0 && (
            <Text
              position={[0, -0.95, 0]}
              fontSize={0.56}
              color="#c3cadb"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#0a0c11"
              fontWeight="bold"
              frustumCulled={false}
            >
              {formatCurrency(growthTotalByDepth[i])}
            </Text>
          )}
        </Billboard>
      ))}
      {buildings
        .filter((b) => b.isAtRisk)
        .map((b) => (
          <CityRiskAura key={`risk-${b.id}`} x={b.x} z={b.z} footprint={b.footprint} />
        ))}
      {buildings
        .filter((b) => riseupMismatchIds.has(b.id))
        .map((b) => (
          <CityRiseupMismatchBadge
            key={`riseup-${b.id}`}
            x={b.x + b.footprint * 1.15}
            z={b.z}
            y={getTerrainHeight(b.x, b.z) + b.height + 2.4}
          />
        ))}
      {familyAvatarTargets.map((t) => (
        <CityFamilyAvatar key={t.id} x={t.x} z={t.z} y={t.y} name={t.name} photoUrl={t.photoUrl} />
      ))}
      {buildings.map((b) => {
        const entity = entities.find((e) => e.id === b.id)!;
        const weight = getWeight(entity);
        // insurance's weight is coverageAmount, which plenty of real policies just don't have a
        // meaningful figure for (or the user hasn't filled in) — rather than showing nothing
        // above the building, fall back to the recurring premium, which every insurance entity
        // does have. Building height/footprint still rank by the real weight, unaffected.
        const displayAmount =
          weight === 0 && entity.details.kind === 'insurance' ? entity.details.monthlyPremium : weight;
        const amount = displayAmount === 0 || hideAmounts ? '' : formatCurrency(displayAmount, entity.currency, usdRate);
        const onOpenThis = () => onOpen(b.id);

        // x/z come from the render-time drag position (which may differ from b.x/b.z mid-drag),
        // not baked in ahead of time — see CityBuildingItem.
        const renderMesh = (x: number, z: number) => {
          const commonProps = { x, z, height: b.height, footprint: b.footprint, color: b.color, name: b.name, amount };
          if (b.category === 'donation') {
            return <CityGiftMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'investment' && entity.details.assetType === 'alternative') {
            return <CityCrystalMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'expense') {
            return <CityExpenseMesh {...commonProps} expenseType={entity.details.expenseType} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'insurance') {
            return <CityShieldMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'realEstate') {
            return <CityHouseMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'goal') {
            const { targetAmount, currentAmount } = entity.details;
            const progress = targetAmount > 0 ? Math.max(0, Math.min(1, currentAmount / targetAmount)) : 0;
            return <CityGoalMesh {...commonProps} progress={progress} onOpen={onOpenThis} />;
          }
          return <CityBuildingMesh {...commonProps} onOpen={onOpenThis} />;
        };

        return <CityBuildingItem key={b.id} building={b} renderMesh={renderMesh} onOpen={onOpenThis} setControlsEnabled={setControlsEnabled} />;
      })}

      <OrbitControls
        makeDefault
        enabled={controlsEnabled}
        target={[width / 2, 1, groundCenter[1]]}
        enablePan
        enableZoom
        enableRotate
        // primary drag pans freely across the ground instead of orbiting the fixed target —
        // rotate moves to the right button, scroll stays the only way to zoom.
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        screenSpacePanning
        minDistance={10}
        maxDistance={200}
        maxPolarAngle={Math.PI / 2.15}
      />
    </Canvas>
  );
}
