import { en, Faker } from '@faker-js/faker';
import type { Beneficiary, BeneficiaryStatus, Disbursement, Program } from '@ifcui/api-contract';

export interface SeedData {
  programs: Program[];
  beneficiaries: Beneficiary[];
  disbursements: Disbursement[];
}

export interface SeedOptions {
  seed: number;
  beneficiaries?: number;
  disbursements?: number;
}

const PROGRAMS: ReadonlyArray<Pick<Program, 'code' | 'name' | 'currency' | 'status'>> = [
  { code: 'CASH-KE', name: 'Kenya Cash Transfers', currency: 'KES', status: 'active' },
  { code: 'EDU-BD', name: 'Bangladesh Education Grants', currency: 'BDT', status: 'active' },
  { code: 'AGRI-PE', name: 'Peru Smallholder Support', currency: 'PEN', status: 'closed' },
];

const COUNTRIES: Record<string, readonly string[]> = {
  'CASH-KE': ['KE', 'KE', 'KE', 'UG', 'TZ'],
  'EDU-BD': ['BD', 'BD', 'BD', 'IN', 'NP'],
  'AGRI-PE': ['PE', 'PE', 'BO', 'EC'],
};

const REF_DATE = new Date('2026-06-30T00:00:00.000Z');
const START_DATE = new Date('2024-01-01T00:00:00.000Z');

/** Deterministic seed: the same `seed` always produces identical data. */
export function createSeed({ seed, beneficiaries = 500, disbursements = 2000 }: SeedOptions): SeedData {
  const f = new Faker({ locale: [en] });
  f.seed(seed);
  f.setDefaultRefDate(REF_DATE);

  const programs: Program[] = PROGRAMS.map((p) => ({
    ...p,
    id: f.string.uuid() as Program['id'],
    createdAt: f.date.between({ from: START_DATE, to: '2024-03-01T00:00:00.000Z' }).toISOString(),
  }));

  const statuses: BeneficiaryStatus[] = [
    'verified',
    'verified',
    'verified',
    'verified',
    'pending',
    'pending',
    'suspended',
  ];
  const bens: Beneficiary[] = Array.from({ length: beneficiaries }, () => {
    const program = f.helpers.arrayElement(programs);
    return {
      id: f.string.uuid() as Beneficiary['id'],
      programId: program.id,
      displayName: f.person.fullName(),
      country: f.helpers.arrayElement(COUNTRIES[program.code] ?? ['US']),
      status: f.helpers.arrayElement(statuses),
      createdAt: f.date.between({ from: program.createdAt, to: REF_DATE }).toISOString(),
    };
  });

  // Disbursements only for beneficiaries that were verified at some point.
  const payable = bens.filter((b) => b.status !== 'pending');
  const currencyByProgram = new Map(programs.map((p) => [p.id, p.currency]));
  const disb: Disbursement[] = payable.length
    ? Array.from({ length: disbursements }, () => {
        const b = f.helpers.arrayElement(payable);
        const createdAt = f.date.between({ from: b.createdAt, to: REF_DATE });
        const approved = f.number.float() < 0.7;
        return {
          id: f.string.uuid() as Disbursement['id'],
          programId: b.programId,
          beneficiaryId: b.id,
          amountMinor: f.number.int({ min: 50, max: 2500 }) * 100,
          currency: currencyByProgram.get(b.programId) ?? 'USD',
          status: approved ? 'approved' : 'pending',
          createdAt: createdAt.toISOString(),
          approvedAt: approved
            ? new Date(
                Math.min(createdAt.getTime() + f.number.int({ min: 1, max: 14 }) * 86_400_000, REF_DATE.getTime()),
              ).toISOString()
            : null,
        };
      })
    : [];

  return { programs, beneficiaries: bens, disbursements: disb };
}
