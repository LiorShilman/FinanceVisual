import type { FamilyMember } from './familyMember';
import type { FinancialEntity } from './entity';

export const SEED_FAMILY_MEMBERS: FamilyMember[] = [{ id: 'self', name: 'עצמי', relation: 'self' }];

export const SEED_ENTITIES: FinancialEntity[] = [
  {
    id: 'income-salary',
    name: 'משכורת',
    ownerIds: ['self'],
    linkedEntityIds: [],
    details: { kind: 'income', monthlyAmount: 18000 },
  },
  {
    id: 'expense-living',
    name: 'הוצאות מחיה',
    ownerIds: ['self'],
    linkedEntityIds: [],
    details: { kind: 'expense', monthlyAmount: 9000, essential: true },
  },
  {
    id: 'savings-emergency',
    name: 'קרן חירום',
    ownerIds: ['self'],
    liquidity: 'immediate',
    linkedEntityIds: [],
    details: { kind: 'savings', balance: 15000, isEmergencyFund: true },
  },
  {
    id: 'investment-index',
    name: 'תיק השקעות',
    ownerIds: ['self'],
    liquidity: 'shortTerm',
    linkedEntityIds: [],
    details: { kind: 'investment', balance: 60000, monthlyContribution: 1000 },
  },
  {
    id: 'pension-main',
    name: 'קרן פנסיה',
    ownerIds: ['self'],
    liquidity: 'locked',
    linkedEntityIds: [],
    details: { kind: 'pension', balance: 220000, monthlyContribution: 1800 },
  },
  {
    id: 'insurance-life',
    name: 'ביטוח חיים',
    ownerIds: ['self'],
    linkedEntityIds: ['debt-mortgage'],
    details: { kind: 'insurance', coverageAmount: 500000, monthlyPremium: 180, insuranceType: 'life' },
  },
  {
    id: 'debt-mortgage',
    name: 'משכנתא',
    ownerIds: ['self'],
    linkedEntityIds: ['realestate-home', 'insurance-life'],
    details: { kind: 'debt', outstandingBalance: 850000, monthlyPayment: 4200, interestRatePct: 3.2 },
  },
  {
    id: 'realestate-home',
    name: 'דירת מגורים',
    ownerIds: ['self'],
    linkedEntityIds: ['debt-mortgage'],
    details: { kind: 'realEstate', currentValue: 1600000 },
  },
];
