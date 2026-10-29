import { Decimal128, Int32, ObjectId } from 'bson';
import { describe, expect, it } from 'vitest';
import { inferSchema } from '../src/schema.js';

describe('inferSchema', () => {
  it('merges types per path and computes presence', () => {
    const schema = inferSchema([{ a: 1, b: { c: 'x' } }, { a: 's' }]);
    expect(schema.a).toEqual({ types: ['number', 'string'], presence: 1 });
    expect(schema.b).toEqual({ types: ['object'], presence: 0.5 });
    expect(schema['b.c']).toEqual({ types: ['string'], presence: 0.5 });
  });

  it('names BSON types', () => {
    const schema = inferSchema([
      { _id: new ObjectId(), at: new Date(), n: new Int32(3), d: Decimal128.fromString('1.5'), t: [1], z: null, ok: true },
    ]);
    expect(schema._id?.types).toEqual(['objectId']);
    expect(schema.at?.types).toEqual(['date']);
    expect(schema.n?.types).toEqual(['int']);
    expect(schema.d?.types).toEqual(['decimal']);
    expect(schema.t?.types).toEqual(['array']);
    expect(schema.z?.types).toEqual(['null']);
    expect(schema.ok?.types).toEqual(['boolean']);
  });

  it('walks into arrays of objects and scalars', () => {
    const schema = inferSchema([{ cast: [{ name: 'A' }, { name: 'B' }], tags: ['x'] }, { cast: [] }]);
    expect(schema['cast.name']).toEqual({ types: ['string'], presence: 0.5 });
    expect(schema['tags[]']).toEqual({ types: ['string'], presence: 0.5 });
  });

  it('returns an empty schema for no documents', () => {
    expect(inferSchema([])).toEqual({});
  });
});
