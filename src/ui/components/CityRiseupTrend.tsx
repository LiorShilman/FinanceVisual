import { Billboard, Text } from '@react-three/drei';
import type { MonthHistoryPoint } from '../../app/riseupHistory';
import { formatCurrency } from '../format';

interface Props {
  x: number;
  y: number;
  z: number;
  history: MonthHistoryPoint[];
}

const BAR_WIDTH = 0.68;
// widened from 0.35 — the amount labels above each bar are wider than the bar itself, and at the
// old gap neighboring labels overlapped each other.
const BAR_GAP = 0.8;
const MAX_BAR_HEIGHT = 5.2;
// the whole chart floats above the ground on its own platform rather than growing straight out of
// the grid — grown out of the same shallow-camera-angle issue as the month labels/DEPTH_LABELS:
// bars rooted right at ground level read as sunk into the terrain from this city's viewing angle,
// not just their own labels.
const GRAPH_LIFT = 4.4;
const POSITIVE_COLOR = '#2f9e58';
const NEGATIVE_COLOR = '#d64545';

function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(new Date(year, month - 1, 1));
}

/**
 * A small in-city bar chart of RiseUp's real month-over-month net (income − expense) — the
 * time-lapse trend the city otherwise has no way to show, since every other visual reflects only
 * the current snapshot. One bar per month actually returned by fetchRiseupHistory (a month with
 * no data is skipped rather than drawn as a misleading zero), green above the baseline / red
 * below, tallest bar in the set always at MAX_BAR_HEIGHT so the shape stays readable regardless
 * of the account's absolute scale.
 */
export function CityRiseupTrend({ x, y, z, history }: Props) {
  if (history.length === 0) return null;
  const maxAbs = Math.max(1, ...history.map((h) => Math.abs(h.net)));
  const totalWidth = (history.length - 1) * (BAR_WIDTH + BAR_GAP);

  return (
    <group position={[x, y + GRAPH_LIFT, z]}>
      {/* pulled forward to roughly split the gap between the bars (z=0) and the now much-further-
          forward month labels (z=5.5) — both are Billboards, so both always face the camera dead-
          on regardless of z, but sitting at very different camera distances still makes them scale
          and sit on screen so differently that the title reads as disconnected from the rest of
          the chart, not part of the same composition. */}
      <Billboard position={[totalWidth / 2, MAX_BAR_HEIGHT + 1, 2.5]}>
        <Text
          fontSize={0.52}
          color="#c3cadb"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.018}
          outlineColor="#0a0c11"
          fontWeight="bold"
          frustumCulled={false}
        >
          מגמת מאזן חודשי — RiseUp
        </Text>
      </Billboard>
      {history.map((h, i) => {
        const barHeight = Math.max(0.18, (Math.abs(h.net) / maxAbs) * MAX_BAR_HEIGHT);
        const color = h.net >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;
        // `history` is oldest-first, but in this RTL city higher x reads as "further right" and
        // lower x as "further left" (the same convention every district column already uses —
        // see domain/city.ts's baseX) — so the *current* month (last in the array) needs the
        // lowest x to land on the left, with earlier months increasing in x toward the right.
        const bx = (history.length - 1 - i) * (BAR_WIDTH + BAR_GAP);
        // one flat dim shade for every past month, not a gradient — the point is "current vs.
        // everything else", not a ranking of how old each past month is.
        const isCurrent = i === history.length - 1;
        const opacity = isCurrent ? 1 : 0.35;
        return (
          <group key={h.month} position={[bx, 0, 0]}>
            <mesh position={[0, barHeight / 2, 0]} frustumCulled={false}>
              <boxGeometry args={[BAR_WIDTH, barHeight, BAR_WIDTH]} />
              <meshStandardMaterial
                color="#171a22"
                emissive={color}
                emissiveIntensity={isCurrent ? 1.2 : 0.85}
                roughness={0.5}
                transparent
                opacity={opacity}
              />
            </mesh>
            {/* a bright wireframe rim on the bar's own edges — the same trick every other faceted
                mesh in the city (shield/trophy/fountain/lantern) uses so it reads as an actual box
                with depth instead of a flat painted rectangle. */}
            <mesh position={[0, barHeight / 2, 0]} scale={[1.05, 1.02, 1.05]} frustumCulled={false}>
              <boxGeometry args={[BAR_WIDTH, barHeight, BAR_WIDTH]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthWrite={false} />
            </mesh>
            {isCurrent && <pointLight position={[0, barHeight * 0.6, 0]} color={color} intensity={0.6} distance={3} decay={2} />}
            {/* gold, not the bar's own green/red — the bar already carries that signal, and a
                green label on a green bar (or red-on-red) was nearly unreadable. Gold matches
                every other floating money label in the city (CityBuildingMesh, CityGoalMesh,
                CityExpenseMesh), so it reads as "an amount" at a glance here too. */}
            <Billboard position={[0, barHeight + 0.45, 0]}>
              <Text
                fontSize={0.4}
                color="#ffd166"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.026}
                outlineColor="#0a0c11"
                outlineBlur={0.02}
                fontWeight="bold"
                frustumCulled={false}
              >
                {formatCurrency(h.net)}
              </Text>
            </Billboard>
            {/* well above ground (not just barely, y=0.15) — same fix as CityView's own
                DEPTH_LABELS: a near-ground Billboard reads as "under/blending with the ground"
                from this city's shallow camera angle even when its Z is already correct, since
                closer-to-camera near-ground content exaggerates that perspective artifact. Pulled
                forward in front of the bar's own footprint so it doesn't clip into the box. */}
            <Billboard position={[0, 1, 5.5]}>
              <Text
                fontSize={0.62}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#0a0c11"
                fontWeight="bold"
                frustumCulled={false}
              >
                {formatMonthShort(h.month)}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
