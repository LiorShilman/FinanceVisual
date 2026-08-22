import { z } from 'zod';

export const FAMILY_RELATIONS = ['self', 'spouse', 'child', 'parent', 'other'] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: 'רווק/ה',
  married: 'נשוי/אה',
  divorced: 'גרוש/ה',
  widowed: 'אלמן/ה',
};

export const FamilyMemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  relation: z.enum(FAMILY_RELATIONS),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
});
export type FamilyMember = z.infer<typeof FamilyMemberSchema>;

export const RELATION_LABELS: Record<FamilyRelation, string> = {
  self: 'עצמי',
  spouse: 'בן/בת זוג',
  child: 'ילד/ה',
  parent: 'הורה',
  other: 'אחר',
};
