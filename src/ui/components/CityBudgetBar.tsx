import { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';

// a narrow printed-on ruler strip, like a real syringe or graduated test tube — not a grid
// wrapping the whole barrel (an earlier version's full-cylinder wireframe did that, and it read
// as fogging up the whole tube rather than a measurement scale).
function createRulerTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.strokeStyle = 'rgba(214, 227, 238, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(214, 227, 238, 0.9)';
  ctx.lineWidth = 4;
  for (let i = 1; i < 10; i++) {
    const py = h - (i / 10) * h;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, py);
    ctx.lineTo(w * 0.82, py);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Props {
  x: number;
  z: number;
  y: number;
  // fractions of income (0-1+, uncapped at the source — this component does its own clamping for
  // the visual fill while keeping the raw numbers for the % text). Unallocated is not a prop —
  // it's whatever's left of the tube once these four are drawn.
  needsRatio: number;
  wantsRatio: number;
  // the "20%" bucket, split into two sub-bands drawn back-to-back in the same green zone — a
  // tithe/donation is carved OUT OF the 20%, not added on top of it, so showing it as a distinct
  // shade within that zone (rather than folded invisibly into one solid green, or pulled out into
  // "wants") is what actually represents that.
  savingsContributionRatio: number;
  donationsRatio: number;
  // '' hides these lines (respects hideAmounts) — the headline % split above still shows
  // regardless, since a ratio alone doesn't disclose a ₪ figure. Split across two lines (spending
  // vs. the savings zone) instead of one — five items on a single small line, separated by
  // variable-width space runs, read as cramped and unevenly spaced; two shorter lines with a
  // fixed "·" separator (matching the headline above) fixes both.
  incomeLabel: string;
  spendingLabel: string;
  savingsLabel: string;
}

const FULL_HEIGHT = 4.4;
// the liquid never reaches the glass's own rim — real containers keep headspace at the top, and a
// literal 100%-to-the-brim fill read as if the tube itself were only ever as tall as the data.
const FILL_HEIGHT = FULL_HEIGHT - 0.55;
const RADIUS = 0.4;
// bottom-to-top: savings contribution → donations → unallocated (all three "still yours, not
// spent on today's lifestyle") → wants (spent, discretionary) → needs (spent, unavoidable) — the
// same "good stuff at the bottom, spoken-for stuff on top" reading as the earlier 2-band version
// (green=remaining sat at the bottom, red=committed on top), just subdividing each half further.
const SAVINGS_COLOR = '#204d34';
// a distinct, warmer green-gold for giving — related to savings (same "20%" zone) but visibly not
// the same thing as money building the household's own wealth.
const DONATIONS_COLOR = '#5a6b1f';
const UNALLOCATED_COLOR = '#333a46';
const WANTS_COLOR = '#7a4a1f';
const NEEDS_COLOR = '#5a1f1b';
// a backing panel behind the tube — the same near-black dial-plate color as the emergency-fund
// gauge (see CityEmergencyGauge.tsx), with a gold frame instead of just floating against the
// scene's own grey sky, which read as flat and unfinished on its own.
const PANEL_COLOR = '#0e0f14';
const FRAME_COLOR = '#c2921f';
const PANEL_WIDTH = RADIUS * 3.4;
const PANEL_HEIGHT = FULL_HEIGHT + 0.9;
const PANEL_Z = -(RADIUS + 0.35);

/**
 * A standing glass tube, not a dial — the household's whole monthly income as one fixed-height
 * column, split 50/30/20-style into needs/wants/savings (see domain/budgetSplit.ts) plus whatever
 * income is left undesignated. Replaces an earlier 2-band (committed/free) version — this is the
 * same tube, just subdividing each half once the app could actually tell wants apart from needs
 * and flagged savings apart from raw leftover cash. Low-poly/flat-shaded fills (not a smooth
 * cylinder) match the "not solid" recipe used across the rest of the city — see e.g.
 * CityFountainMesh — instead of reading as a flat, painted-on color band.
 */
export function CityBudgetBar({
  x,
  z,
  y,
  needsRatio,
  wantsRatio,
  savingsContributionRatio,
  donationsRatio,
  incomeLabel,
  spendingLabel,
  savingsLabel,
}: Props) {
  const savingsRatio = savingsContributionRatio + donationsRatio;
  const needsPct = Math.round(needsRatio * 100);
  const wantsPct = Math.round(wantsRatio * 100);
  const savingsPct = Math.round(savingsRatio * 100);

  const rawNeeds = Math.max(0, needsRatio);
  const rawWants = Math.max(0, wantsRatio);
  const rawSavingsContribution = Math.max(0, savingsContributionRatio);
  const rawDonations = Math.max(0, donationsRatio);
  const committed = rawNeeds + rawWants + rawSavingsContribution + rawDonations;
  const overCommitted = committed > 1;
  // scaled down proportionally to fit the tube when the four together exceed 100% of income —
  // the same idea as a stacked bar clipped at its own container, keeping the bands' relative
  // proportions intact rather than clipping off whichever happens to be drawn last.
  const scale = overCommitted ? 1 / committed : 1;

  let savingsContributionHeight = rawSavingsContribution * scale * FILL_HEIGHT;
  let donationsHeight = rawDonations * scale * FILL_HEIGHT;
  // a real but tiny donation (e.g. 1% of income) rendered at true scale is a sliver so thin its
  // flat-shaded side faces barely catch any light — it reads as a dark seam, not a colored band.
  // Borrowing height from the savingsContribution band right next to it keeps their combined
  // total (and everything stacked above them) exactly unchanged, so only the internal split
  // within the "20%" zone shifts, not the zone's own boundaries.
  const MIN_VISIBLE_BAND = 0.12;
  if (donationsHeight > 0.001 && donationsHeight < MIN_VISIBLE_BAND) {
    const boost = Math.min(MIN_VISIBLE_BAND - donationsHeight, savingsContributionHeight);
    donationsHeight += boost;
    savingsContributionHeight -= boost;
  }
  const wantsHeight = rawWants * scale * FILL_HEIGHT;
  const needsHeight = rawNeeds * scale * FILL_HEIGHT;
  const savingsHeight = savingsContributionHeight + donationsHeight;
  const unallocatedHeight = overCommitted ? 0 : Math.max(0, FILL_HEIGHT - savingsHeight - wantsHeight - needsHeight);

  const savingsContributionTop = savingsContributionHeight;
  const savingsTop = savingsContributionTop + donationsHeight;
  const unallocatedTop = savingsTop + unallocatedHeight;
  const wantsTop = unallocatedTop + wantsHeight;

  const rulerTexture = useMemo(() => createRulerTexture(), []);
  // the frame itself joins the warning, not just the needs band and the text below — the same
  // red already used for the "⚠ ההוצאות עוברות את ההכנסה" line, so the whole fixture reads as
  // alarmed at a glance instead of needing a second look to spot the one darker band inside it.
  const frameColor = overCommitted ? '#e05a4e' : FRAME_COLOR;

  return (
    <group position={[x, y, z]}>
      {/* backing panel — gold-framed near-black plate, matching the emergency gauge's own dial. */}
      <mesh position={[0, FULL_HEIGHT / 2, PANEL_Z - 0.03]} frustumCulled={false}>
        <planeGeometry args={[PANEL_WIDTH + 0.14, PANEL_HEIGHT + 0.14]} />
        <meshStandardMaterial color={frameColor} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, FULL_HEIGHT / 2, PANEL_Z]} frustumCulled={false}>
        <planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
        <meshStandardMaterial color={PANEL_COLOR} roughness={0.85} />
      </mesh>

      {/* no glass fill — that read as a grey haze over the black panel behind it. Just the fills
          themselves, framed top and bottom by a thin border ring, like a container's rim. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[RADIUS, 20]} />
        <meshStandardMaterial color="#1a1c24" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[RADIUS, 0.02, 8, 24]} />
        <meshBasicMaterial color={frameColor} />
      </mesh>
      <mesh position={[0, FULL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[RADIUS, 0.02, 8, 24]} />
        <meshBasicMaterial color={frameColor} />
      </mesh>

      {/* syringe-style graduation marks — a printed-on ruler texture confined to a thin strip on
          the tube's front face, not a grid wrapped around the whole barrel. Sized to FILL_HEIGHT,
          not FULL_HEIGHT, so its 100% mark lines up with the liquid's own actual ceiling, not the
          empty headspace above it. Mounted just outside the glass so it doesn't z-fight with it. */}
      <mesh position={[0, FILL_HEIGHT / 2, RADIUS + 0.01]} frustumCulled={false}>
        <planeGeometry args={[RADIUS * 0.7, FILL_HEIGHT]} />
        <meshBasicMaterial map={rulerTexture} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {savingsContributionHeight > 0.001 && (
        <mesh position={[0, savingsContributionHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, savingsContributionHeight, 8]} />
          <meshStandardMaterial color={SAVINGS_COLOR} emissive={SAVINGS_COLOR} emissiveIntensity={0.32} flatShading roughness={0.6} />
        </mesh>
      )}
      {donationsHeight > 0.001 && (
        <mesh position={[0, savingsContributionTop + donationsHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, donationsHeight, 8]} />
          <meshStandardMaterial color={DONATIONS_COLOR} emissive={DONATIONS_COLOR} emissiveIntensity={0.3} flatShading roughness={0.6} />
        </mesh>
      )}
      {unallocatedHeight > 0.001 && (
        <mesh position={[0, savingsTop + unallocatedHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, unallocatedHeight, 8]} />
          <meshStandardMaterial color={UNALLOCATED_COLOR} emissive={UNALLOCATED_COLOR} emissiveIntensity={0.18} flatShading roughness={0.7} />
        </mesh>
      )}
      {wantsHeight > 0.001 && (
        <mesh position={[0, unallocatedTop + wantsHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, wantsHeight, 8]} />
          <meshStandardMaterial color={WANTS_COLOR} emissive={WANTS_COLOR} emissiveIntensity={0.26} flatShading roughness={0.6} />
        </mesh>
      )}
      {needsHeight > 0.001 && (
        <mesh position={[0, wantsTop + needsHeight / 2, 0]} frustumCulled={false}>
          <cylinderGeometry args={[RADIUS * 0.86, RADIUS * 0.86, needsHeight, 8]} />
          <meshStandardMaterial
            color={overCommitted ? '#6b241d' : NEEDS_COLOR}
            emissive={overCommitted ? '#6b241d' : NEEDS_COLOR}
            emissiveIntensity={0.22}
            flatShading
            roughness={0.6}
          />
        </mesh>
      )}
      {/* the "20%" line — where flagged savings actually tops out, the headline number this whole
          split exists to answer. */}
      <mesh position={[0, savingsTop, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <ringGeometry args={[RADIUS * 0.8, RADIUS * 0.98, 20]} />
        <meshBasicMaterial color="#ffe08a" side={THREE.DoubleSide} />
      </mesh>

      {/* well above the tube's own top (FULL_HEIGHT) — the stack's lower lines use *negative*
          local offsets, so the base itself has to clear FULL_HEIGHT by more than just those
          lines' own spacing, or the bottom lines end up back down inside the tube's own height
          range, right where an earlier version of this put them. */}
      <Billboard position={[0, FULL_HEIGHT + 4.8, 0]}>
        <Text fontSize={1.8} color="#ffd166" anchorX="center" anchorY="bottom" outlineWidth={0.045} outlineColor="#5a3d00" fontWeight="bold" frustumCulled={false}>
          {`צרכים ${needsPct}% · רצונות ${wantsPct}% · חיסכון ${savingsPct}%`}
        </Text>
        {incomeLabel !== '' && (
          <Text position={[0, -1, 0]} fontSize={0.9} color="#ffffff" anchorX="center" anchorY="top" outlineWidth={0.036} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {incomeLabel}
          </Text>
        )}
        {spendingLabel !== '' && (
          <Text position={[0, -2, 0]} fontSize={0.75} color="#ffe0a3" anchorX="center" anchorY="top" outlineWidth={0.03} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {spendingLabel}
          </Text>
        )}
        {savingsLabel !== '' && (
          <Text position={[0, -2.85, 0]} fontSize={0.75} color="#ffe0a3" anchorX="center" anchorY="top" outlineWidth={0.03} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            {savingsLabel}
          </Text>
        )}
        {overCommitted && (
          <Text position={[0, -3.7, 0]} fontSize={0.7} color="#e05a4e" anchorX="center" anchorY="top" outlineWidth={0.03} outlineColor="#0a0c11" fontWeight="bold" frustumCulled={false}>
            ⚠ ההוצאות עוברות את ההכנסה
          </Text>
        )}
      </Billboard>
    </group>
  );
}
