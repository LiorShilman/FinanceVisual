import { useMemo, useState, type ElementRef, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Billboard, OrbitControls, Text } from '@react-three/drei';
import { useBoardStore } from '../../app/boardStore';
import type { MonthHistoryPoint } from '../../app/riseupHistory';
import { computeCityAtmosphere } from '../../domain/atmosphere';
import { computeCityLayout, depthBaseZ, depthIndex, DISTRICT_SPACING, LONG_TERM_MIN_Z } from '../../domain/city';
import { computeGroundBounds, type CircularExtent } from '../../domain/cityGrid';
import type { GrowthProjectionPoint } from '../../domain/compoundInterest';
import { computeDebtLinkPaths } from '../../domain/debtLinks';
import { computeEmergencyRunway } from '../../domain/emergencyFund';
import { computeBudgetSplit } from '../../domain/budgetSplit';
import {
  CATEGORY_LABELS,
  ENTITY_CATEGORIES,
  getCheckingAvailableForInvestment,
  getWeight,
  isGrowthAssetDetails,
  type FinancialEntity,
} from '../../domain/entity';
import type { FamilyMember } from '../../domain/familyMember';
import { computeIncomeLinkPaths } from '../../domain/incomeLinks';
import { computeIndependenceProgress } from '../../domain/independence';
import { computeNetWorthBreakdown } from '../../domain/netWorth';
import { getTerrainHeight } from '../../domain/terrain';
import { computeValleyFeature } from '../../domain/valley';
import { computeWaterFeature } from '../../domain/water';
import { formatCurrency } from '../format';
import { CityBeehiveMesh } from './CityBeehiveMesh';
import { CityBudgetBar } from './CityBudgetBar';
import { CityBuildingItem } from './CityBuildingItem';
import { CityBuildingMesh } from './CityBuildingMesh';
import { CityCameraFocus } from './CityCameraFocus';
import { CityCheckingBridge } from './CityCheckingBridge';
import { CityCrystalMesh } from './CityCrystalMesh';
import { CityDebtChains } from './CityDebtChains';
import { CityEmergencyGauge } from './CityEmergencyGauge';
import { CityExpenseMesh } from './CityExpenseMesh';
import { CityFamilyAvatar } from './CityFamilyAvatar';
import { CityFountainMesh } from './CityFountainMesh';
import { CityGivingPillarMesh } from './CityGivingPillarMesh';
import { CityGoalMesh } from './CityGoalMesh';
import { CityGround } from './CityGround';
import { CityGrowthRings } from './CityGrowthRings';
import { CityIndependenceDome } from './CityIndependenceDome';
import { CityHourglassMesh } from './CityHourglassMesh';
import { CityHouseMesh } from './CityHouseMesh';
import { CityIncomeFaucet, FAUCET_ARM_LENGTH, FAUCET_Y } from './CityIncomeFaucet';
import { CityIncomeLinks } from './CityIncomeLinks';
import { CityMedalBadge } from './CityMedalBadge';
import { CityMortgageMesh } from './CityMortgageMesh';
import { CityRiskAura } from './CityRiskAura';
import { CityRiseupMismatchBadge } from './CityRiseupMismatchBadge';
import { CityRiseupTrend } from './CityRiseupTrend';
import { CityShieldMesh } from './CityShieldMesh';
import { CitySun } from './CitySun';
import { CityTreeMesh } from './CityTreeMesh';
import { CityWalkControls } from './CityWalkControls';
import type { LockedCamera } from './cityCameraLock';
import { computeCrystalLabelY, computeTreeLabelY, type TreeVariant } from './cityGrowthGeometry';

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
  // owned by BoardScreen (not this component) so the new left-side CityControlPanel — which lives
  // outside the Canvas tree — can trigger a lock/reset without needing an imperative handle back
  // into here; a plain ref works across that boundary just fine since it's dereferenced lazily.
  controlsRef: RefObject<ElementRef<typeof OrbitControls> | null>;
  lockedCamera: LockedCamera | null;
  // the entity currently open in the growth-forecast calculator (CityControlPanel), and its
  // already-computed projection — both null when the calculator is closed. Computed once in
  // BoardScreen (not here) so the same points feed both the panel's headline numbers and these
  // rings without risking the two drifting apart.
  growthForecastEntityId: string | null;
  growthForecastPoints: GrowthProjectionPoint[] | null;
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

// the checking bridge has no underlying entity of its own to key a drag override off of (see the
// buildings.map override below) — reuses the same cityPositions store other buildings persist
// drags through, just under one fixed synthetic key instead of an entity id.
const CHECKING_BRIDGE_KEY = 'checkingBridge';

// the four growth categories render as trees, not towers — each gets its own species so they stay
// visually distinct from one another (investment's 'alternative' assetType is handled separately,
// as CityCrystalMesh, before this map is even consulted).
const TREE_VARIANT_BY_KIND: Partial<Record<string, TreeVariant>> = {
  savings: 'sapling',
  investment: 'oak',
  pension: 'pine',
  studyFund: 'fruit',
};

export function CityView({
  entities,
  familyMembers,
  riseupMismatchIds,
  riseupHistory,
  controlsRef,
  lockedCamera,
  growthForecastEntityId,
  growthForecastPoints,
  onOpen,
}: Props) {
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const usdRate = useBoardStore((s) => s.usdRate);
  const cityPositions = useBoardStore((s) => s.cityPositions);
  const setCityPosition = useBoardStore((s) => s.setCityPosition);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  // same "reversed index * DISTRICT_SPACING" formula every district position (buildings, ground
  // labels) already uses — see domain/city.ts's baseX and this file's own category-label loop.
  const checkingDefaultX = (ENTITY_CATEGORIES.length - 1 - ENTITY_CATEGORIES.indexOf('checking')) * DISTRICT_SPACING;
  const checkingBridgeMaxOffset = DISTRICT_SPACING / 2 - 1.3;
  const checkingX = Math.min(
    checkingDefaultX + checkingBridgeMaxOffset,
    Math.max(checkingDefaultX - checkingBridgeMaxOffset, cityPositions[CHECKING_BRIDGE_KEY]?.x ?? checkingDefaultX),
  );
  const checkingBridgeZNear = depthBaseZ(1);
  const checkingBridgeZFar = depthBaseZ(2);
  const checkingBridgeCenterZ = (checkingBridgeZNear + checkingBridgeZFar) / 2;
  const buildings = useMemo(() => {
    const layout = computeCityLayout(entities, cityPositions);
    // checking has no building of its own anymore (see CityCheckingBridge) — its every position
    // consumer (the water stream below, any income link to/from it) should read as originating
    // from the bridge's own center, not wherever the now-invisible auto-layout cell would have
    // put it; otherwise a stream/link "starts" from an arbitrary empty point that happens to sit
    // near, but not aligned with, the bridge structure that now represents this category.
    return layout.map((b) => (b.category === 'checking' ? { ...b, x: checkingX, z: checkingBridgeCenterZ } : b));
  }, [entities, cityPositions, checkingX, checkingBridgeCenterZ]);
  const checkingTotal = useMemo(
    () => buildings.filter((b) => b.category === 'checking').reduce((sum, b) => sum + b.weight, 0),
    [buildings],
  );
  const checkingAvailable = useMemo(
    () =>
      entities.reduce(
        (sum, e) => (e.details.kind === 'checking' ? sum + getCheckingAvailableForInvestment(e.details) : sum),
        0,
      ),
    [entities],
  );
  const checkingAvailableRatio = checkingTotal > 0 ? checkingAvailable / checkingTotal : 0;
  const firstCheckingId = useMemo(() => entities.find((e) => e.details.kind === 'checking')?.id ?? null, [entities]);
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
      if (!isGrowthAssetDetails(e.details)) continue;
      totals[depthIndex(e)] = (totals[depthIndex(e)] ?? 0) + getWeight(e);
    }
    return totals;
  }, [entities]);
  // the top-3 largest growth holdings overall — savings/investment/pension/studyFund ranked
  // together against each other by amount, not per-category, so e.g. two pensions could both
  // outrank the single biggest savings account.
  const topGrowthMedals = useMemo(() => {
    const ranked = buildings
      .filter((b) => {
        const details = entities.find((e) => e.id === b.id)?.details;
        return details ? isGrowthAssetDetails(details) : false;
      })
      .sort((a, b) => {
        const weightA = getWeight(entities.find((e) => e.id === a.id)!);
        const weightB = getWeight(entities.find((e) => e.id === b.id)!);
        return weightB - weightA;
      });
    return ranked.slice(0, 3).map((b, i) => {
      const entity = entities.find((e) => e.id === b.id)!;
      const weight = getWeight(entity);
      // the anchor for the *name* — the bottom of CityMedalBadge's own stack — has to match
      // whichever mesh this entity actually renders as (the growth trees or, for an alternative
      // investment, the crystal/predator tree) *exactly*, or the medal floats detached from the
      // canopy instead of sitting right above it. A separate hand-tuned formula here drifted out
      // of sync with the mesh's own geometry once that geometry's own sizing changed, so this
      // calls the same functions the mesh itself uses instead of re-deriving the number.
      const isAlternativeInvestment = entity.details.kind === 'investment' && entity.details.assetType === 'alternative';
      const labelY = isAlternativeInvestment
        ? computeCrystalLabelY(b.height, b.footprint)
        : computeTreeLabelY(b.height, b.footprint, TREE_VARIANT_BY_KIND[entity.details.kind] ?? 'oak');
      return {
        id: b.id,
        x: b.x,
        z: b.z,
        y: getTerrainHeight(b.x, b.z) + labelY,
        rank: (i + 1) as 1 | 2 | 3,
        name: b.name,
        amount: weight === 0 || hideAmounts ? '' : formatCurrency(weight, entity.currency, usdRate),
        // same long-term-tier perspective compensation as every other mesh's own label — see the
        // main buildings.map below.
        labelScale: b.z < 0 ? 1.35 : 1,
      };
    });
  }, [buildings, entities, hideAmounts, usdRate]);
  // the mesh's own label is suppressed for these entities — CityMedalBadge renders the full
  // name/amount stack itself, with the trophy sitting between the two.
  const medalEntityIds = useMemo(() => new Set(topGrowthMedals.map((m) => m.id)), [topGrowthMedals]);
  // where the growth-forecast rings float and where the camera glides to — same labelY-matching
  // trick as topGrowthMedals above. A medaled entity needs much more clearance: CityMedalBadge
  // stacks its own trophy+rank+amount well above that same labelY anchor, and the rings would
  // otherwise render right through the middle of it.
  const growthForecastTarget = useMemo(() => {
    if (!growthForecastEntityId) return null;
    const b = buildings.find((building) => building.id === growthForecastEntityId);
    const entity = entities.find((e) => e.id === growthForecastEntityId);
    if (!b || !entity) return null;
    const isAlternativeInvestment = entity.details.kind === 'investment' && entity.details.assetType === 'alternative';
    const labelY = isAlternativeInvestment
      ? computeCrystalLabelY(b.height, b.footprint)
      : computeTreeLabelY(b.height, b.footprint, TREE_VARIANT_BY_KIND[entity.details.kind] ?? 'oak');
    const terrainY = getTerrainHeight(b.x, b.z);
    const clearance = medalEntityIds.has(growthForecastEntityId) ? 4.6 : 1.6;
    return { x: b.x, z: b.z, y: terrainY + labelY + clearance, color: b.color };
  }, [growthForecastEntityId, buildings, entities, medalEntityIds]);
  // the emergency-fund savings entity's own tree, if one exists — same labelY-matching trick as
  // above, so the gauge sits right above the actual canopy instead of a hand-guessed offset.
  const emergencyGaugeTarget = useMemo(() => {
    const emergencyEntity = entities.find((e) => e.details.kind === 'savings' && e.details.isEmergencyFund);
    if (!emergencyEntity) return null;
    const b = buildings.find((building) => building.id === emergencyEntity.id);
    if (!b) return null;
    const labelY = computeTreeLabelY(b.height, b.footprint, 'sapling');
    const terrainY = getTerrainHeight(b.x, b.z);
    const clearance = medalEntityIds.has(emergencyEntity.id) ? 4.8 : 1.9;
    return { x: b.x, z: b.z, y: terrainY + labelY + clearance };
  }, [entities, buildings, medalEntityIds]);
  const emergencyRunway = useMemo(() => computeEmergencyRunway(entities), [entities]);
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
  const budgetSplit = useMemo(() => computeBudgetSplit(entities), [entities]);
  // one avatar per family member, hovering above the centroid of the buildings they own — not
  // one per owned entity, which would clutter the city fast for anyone owning several things.
  // Members who own nothing yet (or aren't tied to any entity) render no avatar at all. The
  // account owner ("self") is excluded here — their own photo already has a dedicated home in
  // the header's corner badge, so it doesn't need a second, floating copy in the middle of the
  // map too.
  const familyAvatarTargets = useMemo(() => {
    return familyMembers
      .filter((m) => m.relation !== 'self')
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
  // other category's nearest row (see domain/city.ts's depthIndex). minDepthZ is the real
  // drag-reachable minimum (LONG_TERM_MIN_Z), not just depthBaseZ(0)'s own front line — a
  // long-term entity can be manually dragged well behind that line (see domain/city.ts's
  // LONG_TERM_DEPTH_REACH), and sizing the ground/camera to only the front line let a dragged
  // entity walk right off the rendered terrain.
  const minDepthZ = LONG_TERM_MIN_Z;
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
  // to the right of the income faucet's own arm (higher x — see CitySun's own x=width*0.78 for
  // the same "higher x reads as further right" convention in this RTL city) and level with it —
  // the faucet's valve/arm mechanism floats at a fixed absolute FAUCET_Y (13), independent of the
  // income district's own much-lower rooftop height, so parallel placement needs FAUCET_Y, not
  // incomeFaucetTarget.y (which is what put the bar down at rooftop level, nowhere near the
  // faucet, in an earlier version of this). Centered vertically on FAUCET_Y so the tube's own
  // span roughly matches the faucet's; the label stack (see CityBudgetBar.tsx) floats well above
  // both, clearing the faucet's own valve wheel too.
  const budgetBarX = (incomeFaucetTarget?.x ?? width * 0.5) + FAUCET_ARM_LENGTH + 1.1;
  const budgetBarZ = incomeFaucetTarget?.z ?? groundCenter[1];
  const budgetBarY = FAUCET_Y - 2.2;
  const gridDivisions = Math.round(Math.max(bounds.width, bounds.depth) / 1.6);
  // half the diagonal (not half the width/depth) — a dome sized off just one axis would leave the
  // rectangular footprint's own corners poking out past its curved wall.
  const independenceDomeRadius = Math.hypot(bounds.width, bounds.depth) / 2 + 3;
  const independenceProgress = useMemo(() => computeIndependenceProgress(entities), [entities]);
  // once locked, the saved position/target win over the computed defaults — kept fixed here
  // (not recomputed from board data) so the view stays exactly where the user pinned it,
  // regardless of what gets added to the board afterward.
  const initialCameraPosition = lockedCamera?.position ?? [width * 0.25, 36, maxDepthZ + 46];
  const orbitTarget = lockedCamera?.target ?? [width / 2, 1, groundCenter[1]];

  return (
    <Canvas
      camera={{ position: initialCameraPosition, fov: 32 }}
      dir="rtl"
      // preserveDrawingBuffer: without it, the WebGL framebuffer clears itself right after each
      // frame renders — canvas.toDataURL() (used by the download/share buttons in BoardScreen)
      // would capture a blank frame instead of what's actually on screen. dpr caps device pixel
      // ratio at 2x — sharper on high-DPI displays (and in the exported image), without paying
      // for resolutions past what any real screen asks for.
      gl={{ preserveDrawingBuffer: true }}
      dpr={[1, 2]}
    >
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
      <CityIndependenceDome
        x={bounds.center[0]}
        z={bounds.center[1]}
        radius={independenceDomeRadius}
        progress={independenceProgress.progress}
        amountLabel={
          hideAmounts
            ? ''
            : `${formatCurrency(independenceProgress.current)} מתוך ${formatCurrency(independenceProgress.target)}`
        }
        monthlyLabel={
          hideAmounts
            ? ''
            : `משיכה חודשית בטוחה (4%): ${formatCurrency(independenceProgress.monthlySafeWithdrawal)}   מול הוצאה קבועה בפועל: ${formatCurrency(independenceProgress.essentialMonthlyExpenses)}`
        }
        yearsLabel={
          independenceProgress.target <= 0
            ? ''
            : independenceProgress.yearsToIndependence === 0
              ? '🎉 כבר הגעת ליעד העצמאות הכלכלית!'
              : independenceProgress.yearsToIndependence === null
                ? 'בקצב ההפקדות/תשואה הנוכחי, לא צפוי להגיע ליעד'
                : `בעוד כ-${independenceProgress.yearsToIndependence.toFixed(1)} שנים בקצב הנוכחי`
        }
      />
      {emergencyGaugeTarget && (
        <CityEmergencyGauge
          x={emergencyGaugeTarget.x}
          z={emergencyGaugeTarget.z}
          baseY={emergencyGaugeTarget.y}
          monthsOfRunway={emergencyRunway.monthsOfRunway}
          gapLabel={
            hideAmounts || !emergencyRunway.gapToRecommended
              ? ''
              : `חסרים ${formatCurrency(emergencyRunway.gapToRecommended)} ל-3 חודשי שרידות`
          }
        />
      )}
      {budgetSplit.income > 0 && (
        <CityBudgetBar
          x={budgetBarX}
          z={budgetBarZ}
          y={budgetBarY}
          needsRatio={budgetSplit.needs / budgetSplit.income}
          wantsRatio={budgetSplit.wants / budgetSplit.income}
          savingsContributionRatio={budgetSplit.savingsContribution / budgetSplit.income}
          donationsRatio={budgetSplit.donations / budgetSplit.income}
          incomeLabel={hideAmounts ? '' : `הכנסה חודשית: ${formatCurrency(budgetSplit.income)}`}
          spendingLabel={
            hideAmounts ? '' : `צרכים: ${formatCurrency(budgetSplit.needs)} · רצונות: ${formatCurrency(budgetSplit.wants)}`
          }
          savingsLabel={
            hideAmounts
              ? ''
              : [
                  `חיסכון: ${formatCurrency(budgetSplit.savingsContribution)}`,
                  budgetSplit.donations > 0 ? `תרומה: ${formatCurrency(budgetSplit.donations)}` : null,
                  budgetSplit.unallocated > 0 ? `לא מוקצה: ${formatCurrency(budgetSplit.unallocated)}` : null,
                ]
                  .filter((s): s is string => s !== null)
                  .join(' · ')
          }
        />
      )}
      {populatedCategories.has('checking') && firstCheckingId && (
        <CityCheckingBridge
          x={checkingX}
          zNear={checkingBridgeZNear}
          zFar={checkingBridgeZFar}
          amountLabel={hideAmounts ? '' : formatCurrency(checkingTotal)}
          availableLabel={hideAmounts || checkingAvailable <= 0 ? '' : `פנוי להשקעה: ${formatCurrency(checkingAvailable)}`}
          availableRatio={checkingAvailableRatio}
          minX={checkingDefaultX - checkingBridgeMaxOffset}
          maxX={checkingDefaultX + checkingBridgeMaxOffset}
          onMoveX={(newX) => setCityPosition(CHECKING_BRIDGE_KEY, { x: newX, z: 0 })}
          setControlsEnabled={setControlsEnabled}
          onOpen={() => onOpen(firstCheckingId)}
        />
      )}
      <gridHelper
        args={[1, gridDivisions, '#4a5a7a', '#2e3648']}
        scale={[bounds.width, 1, bounds.depth]}
        position={[bounds.center[0], 0, bounds.center[1]]}
        frustumCulled={false}
      />
      {/* off to one side, not dead-center over the district — anchored to the camera-relative
          frame (width/depth) rather than the valley's own far-corner position, which left almost
          no headroom to raise it without pushing it straight out of the frustum's edge. */}
      {/* raised well above its old height (was 19) — the city's own footprint grew a lot this
          session (wider districts, much deeper long/short-term tiers), and a point light that
          close to the ground lit the area right underneath it while the now-much-farther edges
          stayed comparatively dark. Further away is more like the real sun: less of a hotspot,
          more even coverage across a bigger area.
          z was `maxDepthZ * 0.35` — a fraction of only the *front* tier's own z, which never
          accounted for how far the long-term tier's own z now reaches in the *other* (negative)
          direction (see domain/city.ts's LONG_TERM_MIN_Z) — so raising just the height still left
          the sun sitting well toward the front, with the whole deep-back half of the city getting
          no real benefit from the repositioning. groundCenter[1] is the real depth midpoint across
          the *entire* span (both directions), the same center CityGround/the camera's own default
          target already use. */}
      <CitySun x={width * 0.78} y={27} z={groundCenter[1]} breakdown={hideAmounts ? null : netWorth} />
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
        // raised well above ground level (was 1.4) — the label's own Z is already correctly far
        // from the short-term trees (confirmed: same depthBaseZ every tree/label in this city
        // reads from), but a low, ground-level Billboard can still visually align with nearer
        // ground-level content from a shallow camera angle, purely as a perspective/depth-cue
        // artifact, not an actual position error. More height gives it a clearer silhouette
        // against the sky instead of blending into whatever's on the ground near it on screen.
        <Billboard key={label.text} position={[-4.6, 4.5, depthBaseZ(i)]}>
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
      {topGrowthMedals.map((m) => (
        <CityMedalBadge key={`medal-${m.id}`} x={m.x} z={m.z} y={m.y} rank={m.rank} name={m.name} amount={m.amount} labelScale={m.labelScale} />
      ))}
      {familyAvatarTargets.map((t) => (
        <CityFamilyAvatar key={t.id} x={t.x} z={t.z} y={t.y} name={t.name} photoUrl={t.photoUrl} />
      ))}
      {buildings.map((b) => {
        // represented by the bridge (CityCheckingBridge) + its own lake stream instead of a
        // regular tower — a checking account has no natural "building" metaphor the way growth
        // assets or debt do, and the bridge already carries its identity.
        if (b.category === 'checking') return null;
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
          // the locked/long-term depth tier sits a full extra DEPTH_SPACING further back than
          // every other tier (see domain/city.ts's depthBaseZ — it's the only tier with a
          // negative z), so its own floating labels read noticeably smaller on screen despite
          // being the same world-space font size, purely from being that much further from the
          // camera. Bumping their own scale compensates for the perspective shrink.
          const labelScale = b.z < 0 ? 1.35 : 1;
          const commonProps = { x, z, height: b.height, footprint: b.footprint, color: b.color, name: b.name, amount, labelScale };
          if (b.category === 'donation') {
            return <CityGivingPillarMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'income') {
            return <CityBeehiveMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'source') {
            return <CityFountainMesh {...commonProps} onOpen={onOpenThis} />;
          }
          if (entity.details.kind === 'investment' && entity.details.assetType === 'alternative') {
            return <CityCrystalMesh {...commonProps} hideLabel={medalEntityIds.has(b.id)} onOpen={onOpenThis} />;
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
          if (entity.details.kind === 'debt') {
            return entity.details.isMortgage ? (
              <CityMortgageMesh {...commonProps} onOpen={onOpenThis} />
            ) : (
              <CityHourglassMesh {...commonProps} onOpen={onOpenThis} />
            );
          }
          const treeVariant = TREE_VARIANT_BY_KIND[entity.details.kind];
          if (treeVariant) {
            return <CityTreeMesh {...commonProps} variant={treeVariant} hideLabel={medalEntityIds.has(b.id)} onOpen={onOpenThis} />;
          }
          return <CityBuildingMesh {...commonProps} onOpen={onOpenThis} />;
        };

        return <CityBuildingItem key={b.id} building={b} renderMesh={renderMesh} onOpen={onOpenThis} setControlsEnabled={setControlsEnabled} />;
      })}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={controlsEnabled}
        target={orbitTarget}
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
      <CityWalkControls controlsRef={controlsRef} enabled={controlsEnabled} />
      <CityCameraFocus controlsRef={controlsRef} target={growthForecastTarget} />
      {growthForecastTarget && growthForecastPoints && (
        <CityGrowthRings
          x={growthForecastTarget.x}
          z={growthForecastTarget.z}
          baseY={growthForecastTarget.y}
          points={growthForecastPoints}
          color={growthForecastTarget.color}
          formatAmount={(v) => (hideAmounts ? '' : formatCurrency(v))}
        />
      )}
    </Canvas>
  );
}
