import { describe, expect, it } from 'vitest';
import {
  ApiError,
  Beneficiary,
  BeneficiaryListQuery,
  buildPath,
  codeForStatus,
  fromSearch,
  ListQuery,
  NewBeneficiary,
  parseSort,
  routes,
  statusForCode,
  toSearch,
} from '../src';

describe('routes', () => {
  it('builds paths with encoded params', () => {
    expect(buildPath('programs')).toBe('/programs');
    expect(buildPath('beneficiaryStatus', { beneficiaryId: 'a/b c' })).toBe('/beneficiaries/a%2Fb%20c/status');
  });

  it('keeps MSW patterns and built paths in sync', () => {
    for (const pattern of Object.values(routes)) expect(pattern.startsWith('/')).toBe(true);
    expect(buildPath('program', { programId: 'x' })).toBe(routes.program.replace(':programId', 'x'));
  });

  it('round-trips query strings', () => {
    const search = toSearch({ page: 2, pageSize: 25, q: 'ann', sort: undefined, status: '' });
    expect(search).toBe('?page=2&pageSize=25&q=ann');
    expect(ListQuery.parse(fromSearch(new URLSearchParams(search)))).toEqual({ page: 2, pageSize: 25, q: 'ann' });
    expect(toSearch({})).toBe('');
    expect(toSearch(undefined)).toBe('');
  });
});

describe('schemas', () => {
  it('applies list defaults and bounds', () => {
    expect(ListQuery.parse({})).toEqual({ page: 0, pageSize: 25 });
    expect(ListQuery.safeParse({ pageSize: 201 }).success).toBe(false);
    expect(ListQuery.safeParse({ sort: 'name' }).success).toBe(false);
    expect(BeneficiaryListQuery.safeParse({ status: 'gone' }).success).toBe(false);
  });

  it('validates beneficiaries', () => {
    const ok = {
      id: '0b8d7c4e-2f3a-4c5d-9e6f-7a8b9c0d1e2f',
      programId: '1b8d7c4e-2f3a-4c5d-9e6f-7a8b9c0d1e2f',
      displayName: 'Ana',
      country: 'PE',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(Beneficiary.safeParse(ok).success).toBe(true);
    expect(Beneficiary.safeParse({ ...ok, country: 'pe' }).success).toBe(false);
    expect(NewBeneficiary.safeParse({ programId: ok.programId, displayName: '  ', country: 'PE' }).success).toBe(false);
  });

  it('parses sort expressions', () => {
    expect(parseSort('createdAt:desc')).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(parseSort('x:sideways')).toBeUndefined();
    expect(parseSort(undefined)).toBeUndefined();
  });
});

describe('ApiError', () => {
  it('maps codes and statuses both ways', () => {
    expect(statusForCode('conflict')).toBe(409);
    expect(codeForStatus(404)).toBe('not_found');
    expect(codeForStatus(400)).toBe('validation');
    expect(codeForStatus(504)).toBe('unavailable');
    expect(codeForStatus(418)).toBe('unknown');
  });

  it('builds validation errors from Zod issues', () => {
    const result = NewBeneficiary.safeParse({});
    if (result.success) throw new Error('expected failure');
    const error = ApiError.fromZod(result.error);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation');
    expect(error.body.details?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'programId' })]),
    );
  });
});
