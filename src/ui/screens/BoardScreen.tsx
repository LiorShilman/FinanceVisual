import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementRef } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useNodesState, useReactFlow, type Connection, type Edge } from '@xyflow/react';
import { OrbitControls } from '@react-three/drei';
import { useBoardStore, useBoardLayout } from '../../app/boardStore';
import { exportBoardToFile, importBoardFromFile } from '../../app/boardTransfer';
import { fetchBudgetStatus, fetchTransactions, type RiseupTransaction } from '../../app/riseupConnection';
import { fetchRiseupHistory, type MonthHistoryPoint } from '../../app/riseupHistory';
import { sumRiseupForBusinesses } from '../../app/riseupSync';
import { useRiseupSuggestions } from '../../app/useRiseupSuggestions';
import { signOutUser } from '../../app/useAuth';
import {
  getGrowthMonthlyContribution,
  getLinkedFieldValue,
  getWeight,
  isGrowthAssetDetails,
  type EntityCategory,
  type EntityDetails,
  type FinancialEntity,
  type RiseupLink,
} from '../../domain/entity';
import { computeGrowthProjection } from '../../domain/compoundInterest';
import { computeHealth, buildHealthContext, getMissingEssentials } from '../../domain/health';
import { computeNodeSize, computeTotalWeight } from '../../domain/sizing';
import { getEntityBucketKey, getOrderedBucketIds, type LayoutMode, type PyramidBand } from '../../domain/layout';
import type { RiseupEntitySuggestion } from '../../domain/riseupSuggestions';
import { CATEGORY_ICONS } from '../icons';
import { LayoutSwitcher } from '../components/LayoutSwitcher';
import { EntityNode } from '../components/EntityNode';
import { GhostNode } from '../components/GhostNode';
import { LabelNode } from '../components/LabelNode';
import { TierBandNode } from '../components/TierBandNode';
import { EntityFormPanel } from '../components/EntityFormPanel';
import { FamilyPanel } from '../components/FamilyPanel';
import { CityControlPanel } from '../components/CityControlPanel';
import { CityView } from '../components/CityView';
import { clearLockedCamera, loadLockedCamera, saveLockedCamera, type LockedCamera } from '../components/cityCameraLock';
import { CurrencyControl } from '../components/CurrencyControl';
import { InvestmentsTablePanel } from '../components/InvestmentsTablePanel';
import { BudgetSplitTablePanel } from '../components/BudgetSplitTablePanel';
import { RiseupTransactionsPanel } from '../components/RiseupTransactionsPanel';
import { RiseupSuggestionsPanel } from '../components/RiseupSuggestionsPanel';
import { formatCurrency } from '../format';
import type { EntityFlowNode, GhostFlowNode } from '../nodeTypes';
import type { LabelFlowNode } from '../components/LabelNode';
import type { TierBandFlowNode } from '../components/TierBandNode';
import styles from './BoardScreen.module.css';

const nodeTypes = { entity: EntityNode, ghost: GhostNode, label: LabelNode, tierBand: TierBandNode };
const NEUTRAL_REGION_COLOR = '#5b6b8c';
// a stable reference (not a fresh `[]` every render) so the riseupMismatchIds memo below doesn't
// think its input changed on every single render while disconnected/still loading.
const EMPTY_RISEUP_TRANSACTIONS: RiseupTransaction[] = [];
const EMPTY_RISEUP_HISTORY: MonthHistoryPoint[] = [];
// RiseUp's own documented history endpoint caps numMonthsBack at 12 — matching that ceiling here
// too, even though this fetches each month individually rather than via that combined endpoint
// (see riseupHistory.ts for why).
const RISEUP_HISTORY_MONTHS = 12;

function edgeColor(a: FinancialEntity, b: FinancialEntity): string {
  const kinds = [a.details.kind, b.details.kind];
  // the destination of the money wins the color, even when the other side is the income that
  // funds it — an expense link is still red, a savings/investment link is still orange, a debt
  // link is still its own blue (not income's green, which it fell through to before this had an
  // explicit case), and "income" only wins when nothing more specific is on the other end.
  if (kinds.includes('expense')) return 'var(--health-risk)';
  if (kinds.includes('savings') || kinds.includes('investment') || kinds.includes('pension') || kinds.includes('studyFund'))
    return 'var(--health-warning)';
  if (kinds.includes('debt')) return 'var(--health-debt)';
  if (kinds.includes('income')) return 'var(--health-good)';
  return 'var(--text-dim)';
}

function findRegionAt(x: number, y: number, regions: PyramidBand[]): PyramidBand | null {
  for (const r of regions) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r;
  }
  return null;
}

const GHOST_PRESETS: Record<string, Partial<EntityDetails>> = {
  emergencyFund: { isEmergencyFund: true },
  lifeInsurance: { insuranceType: 'life' },
  pension: {},
};

function BoardCanvas() {
  const entities = useBoardStore((s) => s.entities);
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const layoutMode = useBoardStore((s) => s.layoutMode);
  const setLayoutMode = useBoardStore((s) => s.setLayoutMode);
  const setFreePosition = useBoardStore((s) => s.setFreePosition);
  const updateEntity = useBoardStore((s) => s.updateEntity);
  const entityOrder = useBoardStore((s) => s.entityOrder);
  const reorderWithinBucket = useBoardStore((s) => s.reorderWithinBucket);
  const hideAmounts = useBoardStore((s) => s.hideAmounts);
  const toggleHideAmounts = useBoardStore((s) => s.toggleHideAmounts);
  const { positions, regions } = useBoardLayout();
  const { fitView, setViewport } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<
    EntityFlowNode | GhostFlowNode | LabelFlowNode | TierBandFlowNode
  >([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{
    category: EntityCategory;
    overrides?: Partial<EntityDetails>;
    name?: string;
    riseupLink?: RiseupLink;
  } | null>(null);
  const [showFamilyPanel, setShowFamilyPanel] = useState(false);
  const [showInvestmentsTable, setShowInvestmentsTable] = useState(false);
  const [showBudgetSplitTable, setShowBudgetSplitTable] = useState(false);
  const [showRiseupTransactions, setShowRiseupTransactions] = useState(false);
  const [showRiseupSuggestions, setShowRiseupSuggestions] = useState(false);
  // enabled by showRiseupSuggestions itself — the hook only actually starts its scan the *first*
  // time this turns true, then keeps the result cached across close/reopen (see the hook's own
  // comment for why: closing and reopening the panel used to re-run the whole multi-month RiseUp
  // scan from scratch every time, which was the real reason adding entities this way felt slow).
  const riseupSuggestions = useRiseupSuggestions(showRiseupSuggestions);
  const [menuOpen, setMenuOpen] = useState(false);
  // the account owner's own photo, if they've added one in the family panel — shown as a small
  // corner badge in the header, not rounded into a circle (a family crest/logo can be a
  // non-square image, and cropping it into a circle cut pieces off in an earlier version of
  // this).
  const selfPhotoUrl = familyMembers.find((m) => m.relation === 'self')?.photoUrl;
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  // owned here (not inside CityView) so the left-side CityControlPanel — rendered outside the
  // Canvas tree — can trigger a lock/reset directly; a plain ref works across that boundary since
  // it's only ever dereferenced lazily, after the Canvas has mounted and attached it.
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const [lockedCamera, setLockedCamera] = useState<LockedCamera | null>(() => loadLockedCamera());

  function handleLockCamera() {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const value: LockedCamera = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    };
    saveLockedCamera(value);
    setLockedCamera(value);
  }

  function handleResetCamera() {
    clearLockedCamera();
    setLockedCamera(null);
  }

  // years and monthly-deposit are "what if" scenario knobs, local to this calculator session —
  // the assumed return % is the one number saved back onto the entity itself (see
  // handleChangeForecastReturnPct), since that's a real belief about the account worth
  // remembering, not a throwaway exploration input.
  const [growthForecast, setGrowthForecast] = useState<{ entityId: string; years: number; monthlyDeposit: number } | null>(
    null,
  );

  function handleOpenGrowthForecast(entityId: string) {
    const entity = entities.find((e) => e.id === entityId);
    if (!entity || !isGrowthAssetDetails(entity.details)) return;
    setGrowthForecast({ entityId, years: 15, monthlyDeposit: getGrowthMonthlyContribution(entity.details) });
    setLayoutMode('city');
    setEditingId(null);
    setCreating(null);
  }

  const growthForecastEntity = growthForecast ? entities.find((e) => e.id === growthForecast.entityId) ?? null : null;
  const growthForecastDetails =
    growthForecastEntity && isGrowthAssetDetails(growthForecastEntity.details) ? growthForecastEntity.details : null;

  const growthForecastPoints = useMemo(() => {
    if (!growthForecast || !growthForecastDetails) return null;
    return computeGrowthProjection(
      growthForecastDetails.balance,
      growthForecast.monthlyDeposit,
      growthForecastDetails.expectedAnnualReturnPct,
      growthForecast.years,
    );
  }, [growthForecast, growthForecastDetails]);

  const growthForecastPanelData =
    growthForecast && growthForecastEntity && growthForecastDetails && growthForecastPoints
      ? {
          entityId: growthForecast.entityId,
          entityName: growthForecastEntity.name,
          balance: growthForecastDetails.balance,
          monthlyDeposit: growthForecast.monthlyDeposit,
          annualReturnPct: growthForecastDetails.expectedAnnualReturnPct,
          years: growthForecast.years,
          finalBalance: growthForecastPoints.at(-1)?.balance ?? growthForecastDetails.balance,
        }
      : null;

  const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  // canvas.toBlob (not toDataURL) — a data URL of a full-resolution PNG can run to several MB as
  // a base64 string, which both the download link and (worse) the File constructor below would
  // otherwise have to hold as text; toBlob keeps it binary the whole way through.
  function getCityCanvasBlob(): Promise<Blob | null> {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async function handleDownloadCity() {
    const blob = await getCityCanvasBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `העיר-הפיננסית-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleShareCity() {
    const blob = await getCityCanvasBlob();
    if (!blob) return;
    const file = new File([blob], 'העיר-הפיננסית.png', { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) {
      handleDownloadCity();
      return;
    }
    try {
      await navigator.share({ files: [file], title: 'העיר הפיננסית שלי' });
    } catch {
      // AbortError from the user dismissing the native share sheet is expected and not an error
      // worth surfacing; any other failure just leaves them able to use the download button instead.
    }
  }

  const riseupPat = useBoardStore((s) => s.riseupPat);
  // only ever written from the async chain's resolution, never synchronously — same "checking"
  // pattern as FamilyPanel/RiseupTransactionsPanel. Two calls chained (budget status first, for
  // its resolved budgetDate, then transactions for that exact month) since /api/transactions
  // doesn't accept the 'current'/'previous' shorthands. Fetched once here (not per-open of
  // EntityFormPanel) purely so a linked entity's discrepancy indicator has this month's real
  // transactions to compare against — nothing here writes to any entity.
  const [riseupTransactionsResult, setRiseupTransactionsResult] = useState<{ pat: string; transactions: RiseupTransaction[] } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const pat = riseupPat.trim();
    if (!pat) return;
    fetchBudgetStatus(pat, 'current').then((budget) => {
      if (cancelled || budget.status !== 'connected' || !budget.budgetDate) return;
      fetchTransactions(pat, budget.budgetDate).then((transactions) => {
        if (cancelled || !transactions) return;
        setRiseupTransactionsResult({ pat, transactions });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [riseupPat]);

  const riseupTransactions =
    riseupTransactionsResult?.pat === riseupPat.trim() ? riseupTransactionsResult.transactions : EMPTY_RISEUP_TRANSACTIONS;

  // last few months of real RiseUp totals, for CityView's trend chart — fetched once here
  // (independent of the transactions/mismatch fetch above, which only ever needs the current
  // month) rather than inside CityView, keeping every RiseUp network call in one place.
  const [riseupHistoryResult, setRiseupHistoryResult] = useState<{ pat: string; history: MonthHistoryPoint[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pat = riseupPat.trim();
    if (!pat) return;
    fetchRiseupHistory(pat, RISEUP_HISTORY_MONTHS).then((history) => {
      if (!cancelled) setRiseupHistoryResult({ pat, history });
    });
    return () => {
      cancelled = true;
    };
  }, [riseupPat]);

  const riseupHistory = riseupHistoryResult?.pat === riseupPat.trim() ? riseupHistoryResult.history : EMPTY_RISEUP_HISTORY;

  // ids of every linked entity whose stored field doesn't match this month's real RiseUp total —
  // the only input CityView's floating "?" badge needs; the actual comparison numbers still live
  // in EntityFormPanel for when someone opens the entity to see why.
  const riseupMismatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entity of entities) {
      if (!entity.riseupLink) continue;
      const entered = getLinkedFieldValue(entity.details, entity.riseupLink.field);
      if (entered === null) continue;
      const actual = sumRiseupForBusinesses(riseupTransactions, entity.riseupLink.businessNames);
      if (entered !== actual) ids.add(entity.id);
    }
    return ids;
  }, [entities, riseupTransactions]);

  const handleImportFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    if (!window.confirm('ייבוא יחליף את כל הנתונים הנוכחיים בלוח. להמשיך?')) return;
    const result = await importBoardFromFile(file);
    if (!result.success) window.alert(result.error);
  }, []);

  const openEditor = useCallback((id: string) => setEditingId(id), []);
  const openCreate = useCallback((category: EntityCategory, presetKey?: string) => {
    setCreating({ category, overrides: presetKey ? GHOST_PRESETS[presetKey] : undefined });
  }, []);

  // remembers which suggestion(s) the currently-open EntityFormPanel was opened *from* (null when
  // it wasn't — the plain "+ ישות" button, or editing an existing entity) — a ref, not state,
  // since it only needs to be read once when that form closes, not drive its own render. An array
  // since the combined-variable-expense flow below resolves several businesses in one save, not
  // just one.
  const creatingFromSuggestionRef = useRef<string[] | null>(null);

  // a suggestion becomes a real entity via the exact same EntityFormPanel every other creation
  // path uses — pre-filled with the suggested name/category/amount and pre-linked to the RiseUp
  // business it came from. markResolved only actually runs once the form reports back a real
  // save (see the onClose handler below) — calling it here, before the user ever confirms
  // anything, meant cancelling out of the form silently dropped the suggestion for good even
  // though no entity was ever created for it. Either way, closing the form (saved or cancelled)
  // reopens the suggestions list automatically instead of leaving the user to reopen it by hand.
  const handleAddRiseupSuggestion = useCallback((suggestion: RiseupEntitySuggestion) => {
    creatingFromSuggestionRef.current = [suggestion.businessName];
    setShowRiseupSuggestions(false);
    setCreating({
      category: suggestion.category,
      name: suggestion.businessName,
      overrides: { [suggestion.linkField]: suggestion.suggestedAmount, ...(suggestion.expenseType ? { expenseType: suggestion.expenseType } : {}) } as Partial<EntityDetails>,
      riseupLink: { field: suggestion.linkField, businessNames: [suggestion.businessName] },
    });
  }, []);

  // several variable-expense suggestions folded into one entity, rather than one entity per
  // business — tracking each discretionary purchase separately is far more granular than most
  // people want, and the budget split (domain/budgetSplit.ts) only needs one combined "wants"
  // figure anyway. essential: false is forced explicitly — EntityFormPanel's own expense default
  // is essential: true, and this entity is definitionally the *non*-essential/discretionary side
  // of spending, the whole reason it counts toward the 30% "wants" bucket instead of "needs".
  const handleAddCombinedVariableExpense = useCallback((selected: RiseupEntitySuggestion[]) => {
    if (selected.length === 0) return;
    creatingFromSuggestionRef.current = selected.map((s) => s.businessName);
    setShowRiseupSuggestions(false);
    const totalAmount = selected.reduce((sum, s) => sum + s.suggestedAmount, 0);
    setCreating({
      category: 'expense',
      name: 'הוצאות משתנות',
      overrides: { monthlyAmount: totalAmount, essential: false } as Partial<EntityDetails>,
      riseupLink: { field: 'monthlyAmount', businessNames: selected.map((s) => s.businessName) },
    });
  }, []);

  // the "link to an existing entity instead" path from the suggestions panel — merges with
  // whatever that entity's already linked on the same field, same behavior as
  // RiseupTransactionsPanel's own linking UI, so linking from either place is consistent.
  const handleLinkExistingRiseupSuggestion = useCallback(
    (businessName: string, entityId: string, field: string) => {
      const entity = useBoardStore.getState().entities.find((e) => e.id === entityId);
      if (!entity) return;
      const existingNames = entity.riseupLink?.field === field ? entity.riseupLink.businessNames : [];
      updateEntity(entityId, { riseupLink: { field, businessNames: [...new Set([...existingNames, businessName])] } });
      riseupSuggestions.markResolved(businessName);
    },
    [riseupSuggestions, updateEntity],
  );

  useEffect(() => {
    if (layoutMode === 'city') {
      setNodes([]);
      return;
    }
    const total = computeTotalWeight(entities);
    const ctx = buildHealthContext(entities);

    const entityNodes: EntityFlowNode[] = entities.map((entity) => ({
      id: entity.id,
      type: 'entity',
      position: positions[entity.id] ?? { x: 0, y: 0 },
      draggable: true,
      data: {
        entity,
        size: computeNodeSize(getWeight(entity), total),
        health: computeHealth(entity, ctx),
        onOpen: openEditor,
      },
    }));

    // missing-essential suggestions only show in the free-form view — they'd need a sensible
    // position in every other mode too, and free already surfaces them.
    const missing = layoutMode === 'free' ? getMissingEssentials(entities) : [];
    const ghostNodes: GhostFlowNode[] = missing.map((m, i) => ({
      id: `ghost-${m.key}`,
      type: 'ghost',
      position: { x: -260, y: i * 130 },
      draggable: false,
      data: {
        label: m.label,
        icon: CATEGORY_ICONS[m.category],
        onCreate: () => openCreate(m.category, m.key),
      },
    }));

    const labelNodes: LabelFlowNode[] = regions.map((region) => ({
      id: `label-${region.key}`,
      type: 'label',
      position: { x: region.x + 16, y: region.y - 34 },
      draggable: false,
      selectable: false,
      data: { text: region.label },
    }));

    const bandNodes: TierBandFlowNode[] = regions.map((region) => ({
      id: `band-${region.key}`,
      type: 'tierBand',
      position: { x: region.x, y: region.y },
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        color: NEUTRAL_REGION_COLOR,
        fillRatio: 0.55,
        width: region.width,
        height: region.height,
      },
    }));

    setNodes([...bandNodes, ...entityNodes, ...ghostNodes, ...labelNodes]);
  }, [entities, layoutMode, positions, regions, openEditor, openCreate, setNodes]);

  useEffect(() => {
    if (layoutMode === 'city') return;
    const t = setTimeout(() => {
      if (layoutMode === 'free') {
        // a self-contained shape meant to be seen whole.
        fitView({ duration: 500, padding: 0.12, maxZoom: 1 });
      } else {
        // side-by-side modes can have many columns — fitting them ALL into view shrinks nodes to
        // an unreadable size on wide screens. A fixed zoom keeps size predictable; the minimap
        // and panning cover the rest, same as any wide dashboard.
        setViewport({ x: 210, y: 90, zoom: 0.8 }, { duration: 500 });
      }
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  const edges = useMemo<Edge[]>(() => {
    // relationship lines (mortgage↔home↔insurance) only read as meaningful in the free-form
    // layout — in a bucketed view they just cross between unrelated columns as noise.
    if (layoutMode !== 'free') return [];
    const byId = new Map(entities.map((e) => [e.id, e]));
    const seen = new Set<string>();
    const result: Edge[] = [];
    for (const e of entities) {
      for (const linkedId of e.linkedEntityIds) {
        const other = byId.get(linkedId);
        if (!other) continue;
        const key = [e.id, linkedId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          id: key,
          source: e.id,
          sourceHandle: 'src',
          target: linkedId,
          targetHandle: 'tgt',
          style: { stroke: edgeColor(e, other), strokeWidth: 1.5, strokeDasharray: '4 4' },
        });
      }
    }
    return result;
  }, [entities, layoutMode]);

  const handleNodeDragStop = useCallback(
    (_: unknown, node: { id: string; type?: string; position: { x: number; y: number } }) => {
      if (node.type !== 'entity') return;

      if (layoutMode === 'free') {
        setFreePosition(node.id, node.position);
        return;
      }

      // bucketed modes: dragging only reorders within the entity's own category — dropping
      // elsewhere snaps back, since there's no "recategorize by dragging" support (yet).
      const entity = entities.find((e) => e.id === node.id);
      if (!entity) return;
      const ownBucketKey = getEntityBucketKey(entity, layoutMode);
      const region = findRegionAt(node.position.x, node.position.y, regions);
      if (!region || region.key !== ownBucketKey) {
        setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: positions[node.id] ?? n.position } : n)));
        return;
      }

      const orderedIds = getOrderedBucketIds(entities, layoutMode, ownBucketKey, entityOrder);
      let targetIndex = orderedIds.length;
      let bestDist = Infinity;
      orderedIds.forEach((id, i) => {
        if (id === node.id) return;
        const p = positions[id];
        if (!p) return;
        const d = Math.hypot(p.x - node.position.x, p.y - node.position.y);
        if (d < bestDist) {
          bestDist = d;
          targetIndex = i;
        }
      });
      reorderWithinBucket(orderedIds, node.id, targetIndex);
    },
    [layoutMode, setFreePosition, entities, regions, entityOrder, reorderWithinBucket, positions, setNodes],
  );

  // records the link on BOTH entities (matching how the seed's mortgage↔insurance↔home links are
  // set up) — edge rendering only needs one side to list the other, but keeping both sides in sync
  // means the link still shows up correctly however either entity is edited afterward.
  const handleConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;
      const sourceEntity = entities.find((e) => e.id === source);
      const targetEntity = entities.find((e) => e.id === target);
      if (!sourceEntity || !targetEntity) return;
      if (!sourceEntity.linkedEntityIds.includes(target)) {
        updateEntity(source, { linkedEntityIds: [...sourceEntity.linkedEntityIds, target] });
      }
      if (!targetEntity.linkedEntityIds.includes(source)) {
        updateEntity(target, { linkedEntityIds: [...targetEntity.linkedEntityIds, source] });
      }
    },
    [entities, updateEntity],
  );

  return (
    <div className={`${styles.screen} ${layoutMode === 'city' ? styles.cityMode : ''}`}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          {selfPhotoUrl && <img src={selfPhotoUrl} alt="" className={styles.selfAvatar} />}
          <div className={styles.titleText}>
            <h1 className={styles.title}>הלוח הפיננסי המשפחתי</h1>
            <span className={styles.subtitle}>גרור, ארגן, בנה את תמונת המצב שלך</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="תפריט"
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`${styles.menu} ${menuOpen ? styles.menuOpen : ''}`}>
          <LayoutSwitcher
            value={layoutMode}
            onChange={(m: LayoutMode) => {
              setLayoutMode(m);
              setMenuOpen(false);
            }}
          />
          <div className={styles.headerActions}>
            <CurrencyControl />
            <button
              type="button"
              className={`${styles.btn} ${hideAmounts ? styles.btnActive : ''}`}
              onClick={toggleHideAmounts}
              title="הסתר/הצג סכומים — שימושי לשיתוף מסך"
            >
              {hideAmounts ? '🙈 סכומים מוסתרים' : '👁️ הסתר סכומים'}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setShowFamilyPanel(true);
                setMenuOpen(false);
              }}
            >
              משפחה ({familyMembers.length})
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setShowRiseupSuggestions(true);
                setMenuOpen(false);
              }}
              title="סריקת תנועות RiseUp למציאת ישויות חדשות מומלצות"
            >
              💡 הצעות מ-RiseUp
            </button>
            <button type="button" className={styles.btn} onClick={exportBoardToFile} title="הורדת כל נתוני הלוח כקובץ JSON">
              ⬇️ ייצוא נתונים
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => importInputRef.current?.click()}
              title="טעינת קובץ JSON שיוצא מכאן — מחליף את כל נתוני הלוח הנוכחיים"
            >
              ⬆️ ייבוא נתונים
            </button>
            <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => {
                setCreating({ category: 'savings' });
                setMenuOpen(false);
              }}
            >
              + ישות
            </button>
            <button type="button" className={styles.btn} onClick={() => void signOutUser()} title="התנתקות מהחשבון">
              התנתקות
            </button>
          </div>
        </div>
      </header>

      <div className={styles.canvasWrap} ref={canvasWrapRef}>
        <CityControlPanel
          isCityMode={layoutMode === 'city'}
          isCameraLocked={lockedCamera !== null}
          onLockCamera={handleLockCamera}
          onResetCamera={handleResetCamera}
          onDownloadImage={handleDownloadCity}
          onShareImage={handleShareCity}
          canShareImage={canShareFiles}
          onOpenAssetTable={() => setShowInvestmentsTable(true)}
          onOpenBudgetSplitTable={() => setShowBudgetSplitTable(true)}
          growthForecast={growthForecastPanelData}
          onChangeForecastYears={(years) => setGrowthForecast((f) => (f ? { ...f, years } : f))}
          onChangeForecastMonthlyDeposit={(monthlyDeposit) => setGrowthForecast((f) => (f ? { ...f, monthlyDeposit } : f))}
          onChangeForecastReturnPct={(pct) => {
            if (growthForecastEntity && growthForecastDetails) {
              updateEntity(growthForecastEntity.id, { details: { ...growthForecastDetails, expectedAnnualReturnPct: pct } });
            }
          }}
          onCloseForecast={() => setGrowthForecast(null)}
          formatAmount={(v) => (hideAmounts ? '' : formatCurrency(v))}
        />
        {layoutMode === 'city' ? (
          <CityView
            entities={entities}
            familyMembers={familyMembers}
            riseupMismatchIds={riseupMismatchIds}
            riseupHistory={riseupHistory}
            controlsRef={controlsRef}
            lockedCamera={lockedCamera}
            growthForecastEntityId={growthForecast?.entityId ?? null}
            growthForecastPoints={growthForecastPoints}
            onOpen={openEditor}
          />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            nodeTypes={nodeTypes}
            proOptions={{ hideAttribution: true }}
            minZoom={0.45}
            maxZoom={1.5}
          >
            <Background gap={28} size={1} color="#232a39" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#3d4c85" maskColor="rgba(10,12,17,0.75)" />
          </ReactFlow>
        )}
      </div>

      {(editingId || creating) && (
        <EntityFormPanel
          entityId={editingId}
          presetCategory={creating?.category}
          presetDetailOverrides={creating?.overrides}
          presetName={creating?.name}
          presetRiseupLink={creating?.riseupLink}
          riseupTransactions={riseupTransactions}
          onOpenGrowthForecast={handleOpenGrowthForecast}
          onClose={(saved) => {
            setEditingId(null);
            setCreating(null);
            const businessNames = creatingFromSuggestionRef.current;
            if (businessNames) {
              creatingFromSuggestionRef.current = null;
              if (saved) for (const name of businessNames) riseupSuggestions.markResolved(name);
              setShowRiseupSuggestions(true);
            }
          }}
        />
      )}

      {showFamilyPanel && (
        <FamilyPanel
          onClose={() => setShowFamilyPanel(false)}
          onOpenRiseupTransactions={() => {
            setShowFamilyPanel(false);
            setShowRiseupTransactions(true);
          }}
        />
      )}

      {showRiseupTransactions && <RiseupTransactionsPanel onClose={() => setShowRiseupTransactions(false)} />}

      {showRiseupSuggestions && (
        <RiseupSuggestionsPanel
          loadState={riseupSuggestions.loadState}
          suggestions={riseupSuggestions.suggestions}
          hasPat={riseupSuggestions.hasPat}
          onClose={() => setShowRiseupSuggestions(false)}
          onAddSuggestion={handleAddRiseupSuggestion}
          onLinkExisting={handleLinkExistingRiseupSuggestion}
          onAddCombinedVariableExpense={handleAddCombinedVariableExpense}
        />
      )}

      {showInvestmentsTable && (
        <InvestmentsTablePanel
          onClose={() => setShowInvestmentsTable(false)}
          onOpenEntity={(id) => {
            setShowInvestmentsTable(false);
            openEditor(id);
          }}
        />
      )}

      {showBudgetSplitTable && (
        <BudgetSplitTablePanel
          onClose={() => setShowBudgetSplitTable(false)}
          onOpenEntity={(id) => {
            setShowBudgetSplitTable(false);
            openEditor(id);
          }}
        />
      )}
    </div>
  );
}

export function BoardScreen() {
  return <BoardCanvas />;
}
