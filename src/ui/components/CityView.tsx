import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Billboard, OrbitControls, Text } from '@react-three/drei';
import { useBoardStore } from '../../app/boardStore';
import { computeCityLayout, DISTRICT_SPACING, DEPTH_SPACING } from '../../domain/city';
import { computeDebtLinkPaths } from '../../domain/debtLinks';
import { CATEGORY_LABELS, ENTITY_CATEGORIES, getWeight, type FinancialEntity } from '../../domain/entity';
import { computeIncomeLinkPaths } from '../../domain/incomeLinks';
import { computeNetWorthBreakdown } from '../../domain/netWorth';
import { getTerrainHeight } from '../../domain/terrain';
import { computeValleyFeature } from '../../domain/valley';
import { computeWaterFeature } from '../../domain/water';
import { formatCurrency } from '../format';
import { CityBuildingMesh } from './CityBuildingMesh';
import { CityCrystalMesh } from './CityCrystalMesh';
import { CityDebtChains } from './CityDebtChains';
import { CityExpenseMesh } from './CityExpenseMesh';
import { CityGiftMesh } from './CityGiftMesh';
import { CityGoalMesh } from './CityGoalMesh';
import { CityGround } from './CityGround';
import { CityHouseMesh } from './CityHouseMesh';
import { CityIncomeFaucet } from './CityIncomeFaucet';
import { CityIncomeLinks } from './CityIncomeLinks';
import { CityShieldMesh } from './CityShieldMesh';
import { CitySun } from './CitySun';

interface Props {
  entities: FinancialEntity[];
  onOpen: (id: string) => void;
}

// index 0 = nearest the camera (Z=0), matching domain/city.ts's depthIndex (locked/long-term
// is farthest, liquid/current is nearest).
const DEPTH_LABELS = ['נעול / טווח ארוך', 'טווח קצר', 'נזיל / שוטף'];

export function CityView({ entities, onOpen }: Props) {
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const usdRate = useBoardStore((s) => s.usdRate);
  const buildings = useMemo(() => computeCityLayout(entities), [entities]);
  const water = useMemo(() => computeWaterFeature(buildings), [buildings]);
  const valley = useMemo(() => computeValleyFeature(buildings, entities), [buildings, entities]);
  const netWorth = useMemo(() => computeNetWorthBreakdown(entities), [entities]);
  const incomeLinkPaths = useMemo(() => computeIncomeLinkPaths(buildings, entities), [buildings, entities]);
  const debtLinkPaths = useMemo(() => computeDebtLinkPaths(buildings, entities), [buildings, entities]);
  const debtPositions = useMemo(
    () => buildings.filter((b) => b.category === 'debt').map((b): [number, number] => [b.x, b.z]),
    [buildings],
  );
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
  // an empty category still owns a column of ground, but labeling a district that holds nothing
  // just reads as clutter — the pyramid already skips empty tiers the same way.
  const populatedCategories = useMemo(() => new Set(buildings.map((b) => b.category)), [buildings]);
  const hasDonations = populatedCategories.has('donation');
  const width = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
  // one extra row of depth when donations exist — their dedicated foreground lane past every
  // other category's nearest row (see domain/city.ts's depthIndex).
  const depth = (hasDonations ? 3 : 2) * DEPTH_SPACING;
  const groundSize = Math.max(width, depth) + 20;
  const groundCenter: [number, number] = [width / 2, depth / 2];

  return (
    <Canvas camera={{ position: [width * 0.25, 36, depth + 46], fov: 32 }} dir="rtl">
      <color attach="background" args={['#0a0c11']} />
      <fog attach="fog" args={['#0a0c11', 60, 160]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[width * 0.4, 26, 14]} intensity={2} />
      <directionalLight position={[-10, 14, -10]} intensity={0.6} color="#6c8dff" />

      <CityGround groundCenter={groundCenter} groundSize={groundSize} water={water} valley={valley} />
      {/* the flat gridHelper that used to sit here was removed with the terrain change — a flat
          grid floating through real hills/valleys looked like a bug, and the terrain's own relief
          now gives the same scale/depth cues the grid used to provide. */}
      {/* lower and off to one side (near the valley, not dead-center) — high above the district
          center made it nearly invisible from the default camera angle; this stays in frame from
          a side view without sitting deep enough in z to dim into the fog. */}
      <CitySun x={valley.center[0] + 4} y={10} z={-4} breakdown={hideAmounts ? null : netWorth} />
      <CityIncomeLinks paths={incomeLinkPaths} />
      <CityDebtChains debtPositions={debtPositions} linkPaths={debtLinkPaths} />
      {incomeFaucetTarget && (
        <CityIncomeFaucet targetX={incomeFaucetTarget.x} targetZ={incomeFaucetTarget.z} targetY={incomeFaucetTarget.y} />
      )}

      {ENTITY_CATEGORIES.filter((cat) => populatedCategories.has(cat)).map((cat) => (
        <Billboard
          key={cat}
          position={[(ENTITY_CATEGORIES.length - 1 - ENTITY_CATEGORIES.indexOf(cat)) * DISTRICT_SPACING, 1.5, depth + 6.5]}
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
        <Billboard key={label} position={[-4.6, 1.4, i * DEPTH_SPACING]}>
          <Text
            fontSize={0.4}
            color="#99a1b3"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#0a0c11"
            frustumCulled={false}
          >
            {label}
          </Text>
        </Billboard>
      ))}
      {buildings.map((b) => {
        const entity = entities.find((e) => e.id === b.id)!;
        const weight = getWeight(entity);
        const amount = weight === 0 || hideAmounts ? '' : formatCurrency(weight, entity.currency, usdRate);
        const commonProps = { x: b.x, z: b.z, height: b.height, footprint: b.footprint, color: b.color, name: b.name, amount };
        const onOpenThis = () => onOpen(b.id);

        let mesh;
        if (b.category === 'donation') {
          mesh = <CityGiftMesh {...commonProps} onOpen={onOpenThis} />;
        } else if (entity.details.kind === 'investment' && entity.details.assetType !== 'traditional') {
          mesh = <CityCrystalMesh {...commonProps} onOpen={onOpenThis} />;
        } else if (entity.details.kind === 'expense') {
          mesh = <CityExpenseMesh {...commonProps} expenseType={entity.details.expenseType} onOpen={onOpenThis} />;
        } else if (entity.details.kind === 'insurance') {
          mesh = <CityShieldMesh {...commonProps} onOpen={onOpenThis} />;
        } else if (entity.details.kind === 'realEstate') {
          mesh = <CityHouseMesh {...commonProps} onOpen={onOpenThis} />;
        } else if (entity.details.kind === 'goal') {
          const { targetAmount, currentAmount } = entity.details;
          const progress = targetAmount > 0 ? Math.max(0, Math.min(1, currentAmount / targetAmount)) : 0;
          mesh = <CityGoalMesh {...commonProps} progress={progress} onOpen={onOpenThis} />;
        } else {
          mesh = <CityBuildingMesh {...commonProps} onOpen={onOpenThis} />;
        }

        // every building sits at the real terrain height for its own x/z instead of a flat 0, so
        // it rests on the hill/valley under it instead of floating or sinking into it.
        return (
          <group key={b.id} position={[0, getTerrainHeight(b.x, b.z), 0]}>
            {mesh}
          </group>
        );
      })}

      <OrbitControls
        makeDefault
        target={[width / 2, 1, depth / 2]}
        enablePan
        enableZoom
        enableRotate
        // primary drag pans freely across the ground instead of orbiting the fixed target —
        // rotate moves to the right button, scroll stays the only way to zoom.
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        screenSpacePanning
        minDistance={10}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.15}
      />
    </Canvas>
  );
}
