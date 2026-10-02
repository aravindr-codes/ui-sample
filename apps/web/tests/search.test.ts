import { describe, expect, it } from 'vitest';
import {
  beneficiaryGridSearch,
  compact,
  disbursementGridSearch,
  fromSortModel,
  toSortModel,
} from '../src/queries/search';

describe('grid search params', () => {
  it('keeps valid values', () => {
    expect(beneficiaryGridSearch.parse({ page: 1, pageSize: 50, sort: 'displayName:asc', status: 'verified' })).toEqual(
      {
        page: 1,
        pageSize: 50,
        sort: 'displayName:asc',
        status: 'verified',
      },
    );
  });

  it('applies defaults when empty', () => {
    expect(compact(beneficiaryGridSearch.parse({}))).toEqual({ page: 0, pageSize: 25 });
  });

  it('falls back instead of failing on malformed values', () => {
    const parsed = beneficiaryGridSearch.parse({ page: -3, pageSize: 7, sort: 'password:asc', status: 'gone', q: 42 });
    expect(compact(parsed)).toEqual({ page: 0, pageSize: 25 });
    expect(disbursementGridSearch.parse({ programId: 'nope' }).programId).toBeUndefined();
  });

  it('maps between sort strings and grid sort models', () => {
    expect(toSortModel('createdAt:desc')).toEqual([{ field: 'createdAt', sort: 'desc' }]);
    expect(toSortModel(undefined)).toEqual([]);
    expect(fromSortModel([{ field: 'amountMinor', sort: 'asc' }])).toBe('amountMinor:asc');
    expect(fromSortModel([])).toBeUndefined();
  });
});
