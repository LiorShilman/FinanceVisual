import type { FamilyMember } from './familyMember';
import type { FinancialEntity } from './entity';

export const SEED_FAMILY_MEMBERS: FamilyMember[] = [{ id: 'self', name: 'עצמי', relation: 'self' }];

export const SEED_ENTITIES: FinancialEntity[] = [
  {
    id: 'income-salary',
    name: 'משכורת',
    ownerIds: ['self'],
    currency: 'ils',
    linkedEntityIds: [],
    details: { kind: 'income', monthlyAmount: 18000 },
  },
  {
    id: 'expense-living',
    name: 'הוצאות מחיה',
    ownerIds: ['self'],
    currency: 'ils',
    linkedEntityIds: [],
    details: { kind: 'expense', monthlyAmount: 9000, essential: true, expenseType: 'other' },
  },
  {
    id: 'savings-emergency',
    name: 'קרן חירום',
    ownerIds: ['self'],
    currency: 'ils',
    liquidity: 'immediate',
    linkedEntityIds: [],
    details: { kind: 'savings', balance: 15000, isEmergencyFund: true, expectedAnnualReturnPct: 1 },
  },
  {
    id: 'investment-index',
    name: 'תיק השקעות',
    ownerIds: ['self'],
    currency: 'ils',
    liquidity: 'shortTerm',
    linkedEntityIds: [],
    details: { kind: 'investment', balance: 60000, monthlyContribution: 1000, assetType: 'traditional', expectedAnnualReturnPct: 7 },
  },
  {
    id: 'pension-main',
    name: 'קרן פנסיה',
    ownerIds: ['self'],
    currency: 'ils',
    liquidity: 'locked',
    linkedEntityIds: [],
    details: { kind: 'pension', balance: 220000, monthlyContribution: 1800, expectedAnnualReturnPct: 5 },
  },
  {
    id: 'insurance-life',
    name: 'ביטוח חיים',
    ownerIds: ['self'],
    currency: 'ils',
    linkedEntityIds: ['debt-mortgage'],
    details: { kind: 'insurance', coverageAmount: 500000, monthlyPremium: 180, insuranceType: 'life' },
  },
  {
    id: 'debt-mortgage',
    name: 'משכנתא',
    ownerIds: ['self'],
    currency: 'ils',
    linkedEntityIds: ['realestate-home', 'insurance-life'],
    details: {
      kind: 'debt',
      outstandingBalance: 850000,
      monthlyPayment: 4200,
      interestRatePct: 3.2,
      isMortgage: false,
      mortgageTracks: [],
    },
  },
  {
    id: 'realestate-home',
    name: 'דירת מגורים',
    ownerIds: ['self'],
    currency: 'ils',
    linkedEntityIds: ['debt-mortgage'],
    details: { kind: 'realEstate', currentValue: 1600000 },
  },
];
