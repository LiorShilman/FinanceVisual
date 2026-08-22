import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Billboard, OrbitControls, Text } from '@react-three/drei';
import { useBoardStore } from '../../app/boardStore';
import { computeCityLayout, DISTRICT_SPACING, DEPTH_SPACING } from '../../domain/city';
import { CATEGORY_LABELS, ENTITY_CATEGORIES, getWeight, type FinancialEntity } from '../../domain/entity';
import { computeGroundBounds, computeWaterFeature } from '../../domain/water';
import { formatCurrencyMasked } from '../format';
import { CityBuildingMesh } from './CityBuildingMesh';
import { CityGround } from './CityGround';

interface Props {
  entities: FinancialEntity[];
  onOpen: (id: string) => void;
}

// index 0 = nearest the camera (Z=0), matching domain/city.ts's depthIndex (locked/long-term
// is farthest, liquid/current is nearest).
const DEPTH_LABELS = ['נעול / טווח ארוך', 'טווח קצר', 'נזיל / שוטף'];

export function CityView({ entities, onOpen }: Props) {
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const buildings = useMemo(() => computeCityLayout(entities), [entities]);
  const water = useMemo(() => computeWaterFeature(buildings), [buildings]);
  const width = (ENTITY_CATEGORIES.length - 1) * DISTRICT_SPACING;
  const depth = 2 * DEPTH_SPACING;
  const groundSize = Math.max(width, depth) + 20;
  const groundCenter: [number, number] = [width / 2, depth / 2];
  // the grid has to cover exactly what the textured ground plane covers — the lake now sits
  // right at (and past) the district square's own corner, so a grid sized to the district alone
  // would stop short of it, leaving a chunk of ground with no grid over it.
  const bounds = computeGroundBounds(groundCenter, groundSize, water);
  const gridDivisions = Math.round(Math.max(bounds.width, bounds.depth) / 1.6);

  return (
    <Canvas camera={{ position: [width * 0.25, 36, depth + 46], fov: 32 }} dir="rtl">
      <color attach="background" args={['#0a0c11']} />
      <fog attach="fog" args={['#0a0c11', 60, 160]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[width * 0.4, 26, 14]} intensity={1.5} />
      <directionalLight position={[-10, 14, -10]} intensity={0.45} color="#6c8dff" />

      <CityGround groundCenter={groundCenter} groundSize={groundSize} water={water} />
      <gridHelper
        args={[1, gridDivisions, '#4a5a7a', '#2e3648']}
        scale={[bounds.width, 1, bounds.depth]}
        position={[bounds.center[0], 0, bounds.center[1]]}
        frustumCulled={false}
      />

      {ENTITY_CATEGORIES.map((cat, i) => (
        <Billboard
          key={cat}
          position={[(ENTITY_CATEGORIES.length - 1 - i) * DISTRICT_SPACING, 1.5, depth + 6.5]}
        >
          <Text
            fontSize={0.72}
            color="#f1f3f8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#0a0c11"
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

      {buildings.map((b) => (
        <CityBuildingMesh
          key={b.id}
          x={b.x}
          z={b.z}
          height={b.height}
          footprint={b.footprint}
          color={b.color}
          name={b.name}
          amount={formatCurrencyMasked(getWeight(entities.find((e) => e.id === b.id)!), hideAmounts)}
          onOpen={() => onOpen(b.id)}
        />
      ))}

      <OrbitControls
        makeDefault
        target={[width / 2, 1, depth / 2]}
        enablePan
        enableZoom
        enableRotate
        minDistance={10}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.15}
      />
    </Canvas>
  );
}
