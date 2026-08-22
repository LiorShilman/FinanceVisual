import { useState } from 'react';
import {
  FAMILY_RELATIONS,
  RELATION_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  type FamilyRelation,
  type MaritalStatus,
} from '../../domain/familyMember';
import { useBoardStore } from '../../app/boardStore';
import styles from './FamilyPanel.module.css';

interface Props {
  onClose: () => void;
}

export function FamilyPanel({ onClose }: Props) {
  const familyMembers = useBoardStore((s) => s.familyMembers);
  const addFamilyMember = useBoardStore((s) => s.addFamilyMember);
  const updateFamilyMember = useBoardStore((s) => s.updateFamilyMember);
  const removeFamilyMember = useBoardStore((s) => s.removeFamilyMember);

  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState<FamilyRelation>('spouse');

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

        {familyMembers.map((m) => (
          <div key={m.id} className={styles.memberRow}>
            <div className={styles.memberRowLine}>
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

        <button type="button" className={styles.closeBtn} onClick={onClose}>
          סגירה
        </button>
      </div>
    </div>
  );
}
