import { useEffect, useRef, useState } from 'react';
import {
  FAMILY_RELATIONS,
  RELATION_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  type FamilyRelation,
  type MaritalStatus,
} from '../../domain/familyMember';
import { buildInsightsSummary } from '../../domain/insights';
import { useBoardStore } from '../../app/boardStore';
import { askQuestion, fetchInsights, type InsightsFetchStatus } from '../../app/insights';
import { resizeImageToDataUrl } from '../../app/imageResize';
import { fetchBudgetStatus, type RiseupConnectionStatus, type RiseupMonthStatus } from '../../app/riseupConnection';
import { formatCurrency } from '../format';
import styles from './FamilyPanel.module.css';

const RISEUP_STATUS_LABEL: Record<RiseupConnectionStatus, string> = {
  unset: 'לא מוגדר',
  checking: 'בודק…',
  connected: 'מחובר',
  invalidPat: 'PAT לא תקין',
  unreachable: 'לא מחובר',
};

type AiPillState = 'unset' | 'loading' | InsightsFetchStatus;

const AI_STATUS_LABEL: Record<AiPillState, string> = {
  unset: 'לא הופעל',
  loading: 'טוען…',
  ok: 'עודכן',
  invalidKey: 'מפתח לא תקין',
  unreachable: 'לא זמין',
};

interface Props {
  onClose: () => void;
  onOpenRiseupTransactions: () => void;
}

export function FamilyPanel({ onClose, onOpenRiseupTransactions }: Props) {
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const addFamilyMember = useBoardStore((s) => s.addFamilyMember);
  const updateFamilyMember = useBoardStore((s) => s.updateFamilyMember);
  const removeFamilyMember = useBoardStore((s) => s.removeFamilyMember);

  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState<FamilyRelation>('spouse');

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);

  function handlePhotoPick(file: File | undefined) {
    const targetId = photoTargetId;
    if (!file || !targetId) return;
    resizeImageToDataUrl(file).then((photoUrl) => {
      updateFamilyMember(targetId, { photoUrl });
    });
  }

  const riseupPat = useBoardStore((s) => s.riseupPat);
  const setRiseupPat = useBoardStore((s) => s.setRiseupPat);

  // riseupPatDraft tracks every keystroke; the store's riseupPat (synced to Firestore) only
  // changes on blur/Enter — the connection check runs off the synced value so typing doesn't
  // fire a fetch, or a Firestore write, per character. Initialized straight from the store (not
  // resynced afterward) — by the time this panel can be opened, AuthGate has already finished
  // loading the account's Firestore board, so riseupPat is never stale at mount.
  const [riseupPatDraft, setRiseupPatDraft] = useState(riseupPat);

  // only ever written from the effect's async resolution, never synchronously — "checking" is
  // derived below by comparing the result's pat against the current synced one, so a stale
  // result from a previous token doesn't flash the wrong status while a new check is in flight.
  const [riseupResult, setRiseupResult] = useState<{
    pat: string;
    status: RiseupConnectionStatus;
    data: RiseupMonthStatus | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pat = riseupPat.trim();
    if (!pat) return;
    fetchBudgetStatus(pat, 'current').then((result) => {
      if (!cancelled) setRiseupResult({ pat, ...result });
    });
    return () => {
      cancelled = true;
    };
  }, [riseupPat]);

  const trimmedRiseupPat = riseupPat.trim();
  const riseupStatus: RiseupConnectionStatus = !trimmedRiseupPat
    ? 'unset'
    : riseupResult?.pat === trimmedRiseupPat
      ? riseupResult.status
      : 'checking';
  const monthStatus = riseupResult?.pat === trimmedRiseupPat ? riseupResult.data : null;

  function commitRiseupPat() {
    setRiseupPat(riseupPatDraft);
  }

  const entities = useBoardStore((s) => s.entities);
  const openaiKey = useBoardStore((s) => s.openaiKey);
  const setOpenaiKey = useBoardStore((s) => s.setOpenaiKey);
  const aiInsights = useBoardStore((s) => s.aiInsights);
  const aiInsightsUpdatedAt = useBoardStore((s) => s.aiInsightsUpdatedAt);
  const setAiInsights = useBoardStore((s) => s.setAiInsights);

  // same draft/commit-on-blur pattern as riseupPatDraft above.
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState(openaiKey);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // only the *last fetch attempt's* outcome — not synced, not meant to survive a reload the way
  // the insights themselves (aiInsights) do.
  const [lastFetchStatus, setLastFetchStatus] = useState<InsightsFetchStatus | null>(null);

  function commitOpenaiKey() {
    setOpenaiKey(openaiKeyDraft);
  }

  async function handleRefreshInsights() {
    const key = openaiKey.trim();
    if (!key || insightsLoading) return;
    setInsightsLoading(true);
    setLastFetchStatus(null);
    const result = await fetchInsights(key, buildInsightsSummary(entities));
    setLastFetchStatus(result.status);
    if (result.status === 'ok' && result.insights) setAiInsights(result.insights);
    setInsightsLoading(false);
  }

  // the free-question answer is deliberately not synced (unlike aiInsights) — it's a one-off
  // exchange, not a standing fact worth carrying across devices/reloads the way the automatic
  // insights are.
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askStatus, setAskStatus] = useState<InsightsFetchStatus | null>(null);

  async function handleAsk() {
    const key = openaiKey.trim();
    const q = question.trim();
    if (!key || !q || askLoading) return;
    setAskLoading(true);
    setAskStatus(null);
    setAnswer(null);
    const result = await askQuestion(key, buildInsightsSummary(entities), q);
    setAskStatus(result.status);
    if (result.status === 'ok') setAnswer(result.answer);
    setAskLoading(false);
  }

  const aiPillState: AiPillState = insightsLoading
    ? 'loading'
    : (lastFetchStatus ?? (aiInsights.length > 0 ? 'ok' : 'unset'));

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    addFamilyMember({ name, relation: newRelation });
    setNewName('');
    setNewRelation('other');
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>בני המשפחה</h2>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            handlePhotoPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {familyMembers.map((m) => (
          <div key={m.id} className={styles.memberRow}>
            <div className={styles.memberRowLine}>
              <button
                type="button"
                className={styles.avatarBtn}
                title="העלאת תמונה"
                onClick={() => {
                  setPhotoTargetId(m.id);
                  photoInputRef.current?.click();
                }}
              >
                {m.photoUrl ? (
                  <img className={styles.avatarImg} src={m.photoUrl} alt="" />
                ) : (
                  m.name.trim().charAt(0) || '?'
                )}
              </button>
              <input
                className={styles.memberName}
                value={m.name}
                onChange={(e) => updateFamilyMember(m.id, { name: e.target.value })}
              />
              <select
                className={styles.select}
                value={m.relation}
                onChange={(e) => updateFamilyMember(m.id, { relation: e.target.value as FamilyRelation })}
              >
                {FAMILY_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {RELATION_LABELS[r]}
                  </option>
                ))}
              </select>
              {m.relation !== 'self' && (
                <button type="button" className={styles.removeBtn} onClick={() => removeFamilyMember(m.id)}>
                  הסר
                </button>
              )}
            </div>
            <div className={styles.memberRowLine}>
              <select
                className={styles.select}
                value={m.maritalStatus ?? ''}
                onChange={(e) =>
                  updateFamilyMember(m.id, { maritalStatus: (e.target.value || undefined) as MaritalStatus | undefined })
                }
              >
                <option value="">מצב אישי — ללא ציון</option>
                {MARITAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MARITAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <div className={styles.addRow}>
          <input
            className={styles.memberName}
            placeholder="שם (למשל: דנה)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <select
            className={styles.select}
            value={newRelation}
            onChange={(e) => setNewRelation(e.target.value as FamilyRelation)}
          >
            {FAMILY_RELATIONS.filter((r) => r !== 'self').map((r) => (
              <option key={r} value={r}>
                {RELATION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!newName.trim()}>
          + הוספת בן משפחה
        </button>

        <div className={styles.riseupSection}>
          <div className={styles.riseupHeader}>
            <span className={styles.riseupTitle}>חיבור ל-RiseUp</span>
            <span className={`${styles.riseupPill} ${styles[`riseupPill_${riseupStatus}`]}`}>
              {RISEUP_STATUS_LABEL[riseupStatus]}
            </span>
          </div>
          <input
            className={styles.riseupInput}
            type="password"
            placeholder="הטוקן האישי שלך מ-RiseUp (riseup_pat_…)"
            value={riseupPatDraft}
            onChange={(e) => setRiseupPatDraft(e.target.value)}
            onBlur={commitRiseupPat}
            onKeyDown={(e) => e.key === 'Enter' && commitRiseupPat()}
          />
          {(riseupStatus === 'unset' || riseupStatus === 'invalidPat') && (
            <a
              className={styles.riseupTokenLink}
              href="https://input.riseup.co.il/developer/tokens"
              target="_blank"
              rel="noopener noreferrer"
            >
              {riseupStatus === 'invalidPat' ? 'צור טוקן חדש ב-RiseUp ↗' : 'ליצירת טוקן ב-RiseUp ↗'}
            </a>
          )}
          {riseupStatus === 'connected' && (
            <div className={styles.riseupMonthRow}>
              {monthStatus ? (
                <>
                  <span className={styles.riseupMonthStat}>
                    הוצאות החודש <strong>{formatCurrency(monthStatus.expense)}</strong>
                  </span>
                  <span className={styles.riseupMonthStat}>
                    הכנסות <strong>{formatCurrency(monthStatus.income)}</strong>
                  </span>
                  <span className={`${styles.riseupMonthStat} ${monthStatus.net < 0 ? styles.riseupMonthNegative : ''}`}>
                    מאזן <strong>{formatCurrency(monthStatus.net)}</strong>
                  </span>
                </>
              ) : (
                <span className={styles.riseupMonthStat}>טוען את הוצאות החודש…</span>
              )}
            </div>
          )}
          {riseupStatus === 'connected' && (
            <button type="button" className={styles.riseupTransactionsBtn} onClick={onOpenRiseupTransactions}>
              📋 כל התנועות
            </button>
          )}
        </div>

        <div className={styles.aiSection}>
          <div className={styles.aiHeader}>
            <span className={styles.aiTitle}>תובנות AI</span>
            <span className={`${styles.aiPill} ${styles[`aiPill_${aiPillState}`] ?? ''}`}>{AI_STATUS_LABEL[aiPillState]}</span>
          </div>
          <input
            className={styles.aiInput}
            type="password"
            placeholder="מפתח OpenAI API שלך (sk-…)"
            value={openaiKeyDraft}
            onChange={(e) => setOpenaiKeyDraft(e.target.value)}
            onBlur={commitOpenaiKey}
            onKeyDown={(e) => e.key === 'Enter' && commitOpenaiKey()}
          />
          <button
            type="button"
            className={styles.aiRefreshBtn}
            onClick={handleRefreshInsights}
            disabled={!openaiKey.trim() || insightsLoading}
          >
            {insightsLoading ? 'טוען תובנות…' : 'רענן תובנות'}
          </button>
          {aiInsights.length > 0 && (
            <>
              <ul className={styles.aiInsightsList}>
                {aiInsights.map((insight, i) => (
                  <li key={i} className={styles.aiInsightItem}>
                    {insight}
                  </li>
                ))}
              </ul>
              {aiInsightsUpdatedAt && (
                <span className={styles.aiTimestamp}>עודכן {new Date(aiInsightsUpdatedAt).toLocaleString('he-IL')}</span>
              )}
            </>
          )}

          <input
            className={styles.aiInput}
            type="text"
            placeholder="שאל שאלה חופשית על המצב הכלכלי שלך…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          />
          <button type="button" className={styles.aiRefreshBtn} onClick={handleAsk} disabled={!openaiKey.trim() || !question.trim() || askLoading}>
            {askLoading ? 'שואל…' : 'שאל'}
          </button>
          {askStatus && askStatus !== 'ok' && <span className={styles.aiTimestamp}>{AI_STATUS_LABEL[askStatus]}</span>}
          {answer && <p className={styles.aiInsightItem}>{answer}</p>}
        </div>

        <button type="button" className={styles.closeBtn} onClick={onClose}>
          סגירה
        </button>
      </div>
    </div>
  );
}
