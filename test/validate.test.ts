import { describe, expect, it } from 'vitest';
import { enforceLimit, validatePipeline, validateQueryDocument } from '../src/validate.js';

describe('validatePipeline', () => {
  it('rejects $out', () => {
    const result = validatePipeline([{ $match: {} }, { $out: 'x' }], {});
    expect(result.ok).toBe(false);
  });

  it('rejects $merge', () => {
    const result = validatePipeline([{ $merge: { into: 'x' } }], {});
    expect(result.ok).toBe(false);
  });

  it('rejects a nested $function', () => {
    const result = validatePipeline(
      [{ $match: { $expr: { $function: { body: 'function() { return true; }', args: [], lang: 'js' } } } }],
      {},
    );
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects $accumulator and $where at any depth', () => {
    const accumulator = validatePipeline(
      [{ $group: { _id: null, v: { $accumulator: { init: 'x', accumulate: 'y', accumulateArgs: [], merge: 'z', lang: 'js' } } } }],
      {},
    );
    const where = validatePipeline([{ $facet: { a: [{ $match: { $where: 'true' } }] } }], {});
    expect(accumulator.ok).toBe(false);
    expect(where.ok).toBe(false);
  });

  it('rejects $lookup from a collection outside the allowlist', () => {
    const result = validatePipeline(
      [{ $lookup: { from: 'secrets', localField: 'a', foreignField: 'b', as: 'joined' } }],
      { allowedCollections: ['movies'] },
    );
    expect(result.ok).toBe(false);
  });

  it('rejects $graphLookup and $unionWith outside the allowlist, including nested ones', () => {
    const graph = validatePipeline(
      [{ $graphLookup: { from: 'secrets', startWith: '$a', connectFromField: 'a', connectToField: 'b', as: 'g' } }],
      { allowedCollections: ['movies'] },
    );
    const union = validatePipeline([{ $unionWith: 'secrets' }], { allowedCollections: ['movies'] });
    const nested = validatePipeline([{ $facet: { f: [{ $unionWith: { coll: 'secrets', pipeline: [] } }] } }], {
      allowedCollections: ['movies'],
    });
    expect([graph.ok, union.ok, nested.ok]).toEqual([false, false, false]);
  });

  it('allows $lookup into an allowlisted collection', () => {
    const result = validatePipeline(
      [{ $lookup: { from: 'movies', localField: 'a', foreignField: 'b', as: 'joined' } }],
      { allowedCollections: ['movies'] },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects system collections even without an allowlist', () => {
    const result = validatePipeline([{ $unionWith: 'system.users' }], {});
    expect(result.ok).toBe(false);
  });

  it('rejects malformed pipelines', () => {
    expect(validatePipeline({ $match: {} }, {}).ok).toBe(false);
    expect(validatePipeline([{ $match: {}, $sort: {} }], {}).ok).toBe(false);
    expect(validatePipeline(['$match'], {}).ok).toBe(false);
  });

  it('accepts a plain $match and appends a $limit of 100', () => {
    const result = validatePipeline([{ $match: { year: 2000 } }], {});
    expect(result).toEqual({ ok: true, pipeline: [{ $match: { year: 2000 } }, { $limit: 100 }] });
  });

  it('clamps a $limit of 500 to 100', () => {
    const result = validatePipeline([{ $match: {} }, { $limit: 500 }], {});
    expect(result).toEqual({ ok: true, pipeline: [{ $match: {} }, { $limit: 100 }] });
  });
});

describe('enforceLimit', () => {
  it('keeps a smaller trailing $limit untouched', () => {
    expect(enforceLimit([{ $limit: 5 }])).toEqual([{ $limit: 5 }]);
  });

  it('appends a $limit when later stages could expand the result', () => {
    expect(enforceLimit([{ $limit: 5 }, { $unwind: '$tags' }])).toEqual([
      { $limit: 5 },
      { $unwind: '$tags' },
      { $limit: 100 },
    ]);
  });

  it('replaces an invalid $limit value with the maximum', () => {
    expect(enforceLimit([{ $limit: 'many' }])).toEqual([{ $limit: 100 }]);
  });

  it('honours a custom maximum', () => {
    expect(enforceLimit([{ $match: {} }], 10)).toEqual([{ $match: {} }, { $limit: 10 }]);
  });
});

describe('validateQueryDocument', () => {
  it('rejects denied operators in filters', () => {
    expect(validateQueryDocument({ $where: 'sleep(1000)' }, 'filter').ok).toBe(false);
    expect(validateQueryDocument({ $expr: { $function: { body: '', args: [], lang: 'js' } } }, 'filter').ok).toBe(false);
  });

  it('accepts ordinary filters', () => {
    expect(validateQueryDocument({ year: { $gte: 2000 } }, 'filter')).toEqual({
      ok: true,
      document: { year: { $gte: 2000 } },
    });
  });

  it('rejects non-object values', () => {
    expect(validateQueryDocument([], 'filter').ok).toBe(false);
  });
});

describe('cross-database references', () => {
  it('rejects a $lookup that names another database', () => {
    const result = validatePipeline(
      [{ $lookup: { from: { db: 'other', coll: 'movies' }, pipeline: [], as: 'x' } }],
      { allowedCollections: ['movies'] },
    );
    expect(result.ok).toBe(false);
  });
});
