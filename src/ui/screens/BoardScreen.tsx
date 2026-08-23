import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useNodesState, useReactFlow, type Connection, type Edge } from '@xyflow/react';
import { useBoardStore, useBoardLayout } from '../../app/boardStore';
import { exportBoardToFile, importBoardFromFile } from '../../app/boardTransfer';
import { signOutUser } from '../../app/useAuth';
import { getWeight, type EntityCategory, type EntityDetails, type FinancialEntity } from '../../domain/entity';
import { computeHealth, buildHealthContext, getMissingEssentials } from '../../domain/health';
import { computeNodeSize, computeTotalWeight } from '../../domain/sizing';
import { getEntityBucketKey, getOrderedBucketIds, type LayoutMode, type PyramidBand } from '../../domain/layout';
import { CATEGORY_ICONS } from '../icons';
import { LayoutSwitcher } from '../components/LayoutSwitcher';
import { EntityNode } from '../components/EntityNode';
import { GhostNode } from '../components/GhostNode';
import { LabelNode } from '../components/LabelNode';
import { TierBandNode } from '../components/TierBandNode';
import { EntityFormPanel } from '../components/EntityFormPanel';
import { FamilyPanel } from '../components/FamilyPanel';
import { CityView } from '../components/CityView';
import { CurrencyControl } from '../components/CurrencyControl';
import { InvestmentsTablePanel } from '../components/InvestmentsTablePanel';
import type { EntityFlowNode, GhostFlowNode } from '../nodeTypes';
import type { LabelFlowNode } from '../components/LabelNode';
import type { TierBandFlowNode } from '../components/TierBandNode';
import styles from './BoardScreen.module.css';

const nodeTypes = { entity: EntityNode, ghost: GhostNode, label: LabelNode, tierBand: TierBandNode };
const NEUTRAL_REGION_COLOR = '#5b6b8c';

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
  const [creating, setCreating] = useState<{ category: EntityCategory; overrides?: Partial<EntityDetails> } | null>(
    null,
  );
  const [showFamilyPanel, setShowFamilyPanel] = useState(false);
  const [showInvestmentsTable, setShowInvestmentsTable] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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
          <h1 className={styles.title}>הלוח הפיננסי המשפחתי</h1>
          <span className={styles.subtitle}>גרור, ארגן, בנה את תמונת המצב שלך</span>
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

      <div className={styles.canvasWrap}>
        <button
          type="button"
          className={styles.investmentsFab}
          onClick={() => setShowInvestmentsTable(true)}
          title="טבלת נכסים צומחים מפורטת"
        >
          <svg className={styles.investmentsFabIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="13.5" width="4.2" height="7.5" rx="1.2" fill="currentColor" opacity="0.5" />
            <rect x="9.9" y="8.5" width="4.2" height="12.5" rx="1.2" fill="currentColor" opacity="0.78" />
            <rect x="16.8" y="3" width="4.2" height="18" rx="1.2" fill="currentColor" />
            <path d="M3 10.5 9 6l3.5 2.8L21 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <path d="M16.5 2h4.5v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          </svg>
          טבלת נכסים
        </button>
        {layoutMode === 'city' ? (
          <CityView entities={entities} onOpen={openEditor} />
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
          onClose={() => {
            setEditingId(null);
            setCreating(null);
          }}
        />
      )}

      {showFamilyPanel && <FamilyPanel onClose={() => setShowFamilyPanel(false)} />}

      {showInvestmentsTable && (
        <InvestmentsTablePanel
          onClose={() => setShowInvestmentsTable(false)}
          onOpenEntity={(id) => {
            setShowInvestmentsTable(false);
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
