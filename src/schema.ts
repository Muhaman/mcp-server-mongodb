import type { Document } from 'mongodb';

export interface FieldSummary {
  types: string[];
  presence: number;
}

const BSON_TYPE_NAMES: Record<string, string> = {
  ObjectId: 'objectId',
  Int32: 'int',
  Long: 'long',
  Double: 'double',
  Decimal128: 'decimal',
  Binary: 'binData',
  Timestamp: 'timestamp',
  BSONRegExp: 'regex',
};

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof RegExp) return 'regex';
  if (typeof value === 'object') {
    const tag = (value as { _bsontype?: unknown })._bsontype;
    return typeof tag === 'string' ? (BSON_TYPE_NAMES[tag] ?? tag.toLowerCase()) : 'object';
  }
  return typeof value;
}

function collectTypes(value: unknown, path: string, found: Map<string, Set<string>>): void {
  if (value === undefined) return;
  const type = typeOf(value);
  const types = found.get(path) ?? new Set<string>();
  types.add(type);
  found.set(path, types);

  if (type === 'object') {
    for (const [key, child] of Object.entries(value as Document)) collectTypes(child, `${path}.${key}`, found);
  } else if (type === 'array') {
    for (const item of value as unknown[]) {
      if (typeOf(item) === 'object') {
        for (const [key, child] of Object.entries(item as Document)) collectTypes(child, `${path}.${key}`, found);
      } else {
        collectTypes(item, `${path}[]`, found);
      }
    }
  }
}

/** Infers per-path BSON types and presence (fraction of documents containing the path). */
export function inferSchema(docs: Document[]): Record<string, FieldSummary> {
  const typesByPath = new Map<string, Set<string>>();
  const docsWithPath = new Map<string, number>();

  for (const doc of docs) {
    const found = new Map<string, Set<string>>();
    for (const [key, value] of Object.entries(doc)) collectTypes(value, key, found);
    for (const [path, types] of found) {
      docsWithPath.set(path, (docsWithPath.get(path) ?? 0) + 1);
      const merged = typesByPath.get(path) ?? new Set<string>();
      types.forEach((type) => merged.add(type));
      typesByPath.set(path, merged);
    }
  }

  const schema: Record<string, FieldSummary> = {};
  for (const [path, types] of [...typesByPath].sort(([a], [b]) => a.localeCompare(b))) {
    schema[path] = { types: [...types].sort(), presence: (docsWithPath.get(path) ?? 0) / docs.length };
  }
  return schema;
}
