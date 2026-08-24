import { Billboard, Text } from '@react-three/drei';
import type { MonthHistoryPoint } from '../../app/riseupHistory';
import { formatCurrency } from '../format';

interface Props {
  x: number;
  z: number;
  history: MonthHistoryPoint[];
}

const BAR_WIDTH = 0.55;
// widened from 0.35 — the amount labels above each bar are wider than the bar itself, and at the
// old gap neighboring labels overlapped each other.
const BAR_GAP = 0.65;
const MAX_BAR_HEIGHT = 4.2;
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
export function CityRiseupTrend({ x, z, history }: Props) {
  if (history.length === 0) return null;
  const maxAbs = Math.max(1, ...history.map((h) => Math.abs(h.net)));
  const totalWidth = (history.length - 1) * (BAR_WIDTH + BAR_GAP);

  return (
    <group position={[x, 0, z]}>
      <Billboard position={[totalWidth / 2, MAX_BAR_HEIGHT + 1, 0]}>
        <Text
          fontSize={0.42}
          color="#c3cadb"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
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
        return (
          <group key={h.month} position={[bx, 0, 0]}>
            <mesh position={[0, barHeight / 2, 0]} frustumCulled={false}>
              <boxGeometry args={[BAR_WIDTH, barHeight, BAR_WIDTH]} />
              <meshStandardMaterial color="#171a22" emissive={color} emissiveIntensity={0.85} roughness={0.5} />
            </mesh>
            {/* gold, not the bar's own green/red — the bar already carries that signal, and a
                green label on a green bar (or red-on-red) was nearly unreadable. Gold matches
                every other floating money label in the city (CityBuildingMesh, CityGoalMesh,
                CityExpenseMesh), so it reads as "an amount" at a glance here too. */}
            <Billboard position={[0, barHeight + 0.45, 0]}>
              <Text
                fontSize={0.32}
                color="#ffd166"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.022}
                outlineColor="#0a0c11"
                outlineBlur={0.02}
                fontWeight="bold"
                frustumCulled={false}
              >
                {formatCurrency(h.net)}
              </Text>
            </Billboard>
            {/* above ground (y>0) and pulled forward in front of the bar's own footprint — the
                original negative-y placement sat at/under the ground plane's surface and was
                getting hidden by it (not actually missing, just invisible), and directly below
                the bar's center risked clipping into its own box geometry. */}
            <Billboard position={[0, 0.15, 0.95]}>
              <Text
                fontSize={0.32}
                color="#e4e7ee"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.016}
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
