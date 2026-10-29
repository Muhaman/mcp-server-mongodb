import type { Document } from 'mongodb';

const DENIED_OPERATORS = new Set(['$function', '$accumulator', '$where']);
const WRITE_STAGES = new Set(['$out', '$merge']);
const COLLECTION_STAGES = new Set(['$lookup', '$graphLookup', '$unionWith']);

export type PipelineValidation = { ok: true; pipeline: Document[] } | { ok: false; error: string };
export type DocumentValidation = { ok: true; document: Document } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkCollectionStage(operator: string, spec: unknown, allowed?: string[]): string | undefined {
  const ref = typeof spec === 'string' ? spec : isPlainObject(spec) ? (spec.from ?? spec.coll) : undefined;
  if (ref === undefined) return undefined;
  if (typeof ref !== 'string') return `${operator} must reference a collection by name in the current database`;
  const name = ref;
  if (name.startsWith('system.') || (allowed && !allowed.includes(name))) {
    return `${operator} targets a collection that is not available: ${name}`;
  }
  return undefined;
}

/** Deep-walks a value and returns a description of the first forbidden construct, if any. */
function findViolation(value: unknown, allowed?: string[]): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const violation = findViolation(item, allowed);
      if (violation) return violation;
    }
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (DENIED_OPERATORS.has(key)) return `Operator ${key} is not allowed`;
    if (WRITE_STAGES.has(key)) return `Stage ${key} is not allowed: this server is read-only`;
    if (COLLECTION_STAGES.has(key)) {
      const violation = checkCollectionStage(key, child, allowed);
      if (violation) return violation;
    }
    const violation = findViolation(child, allowed);
    if (violation) return violation;
  }
  return undefined;
}

function clampLimit(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), max) : max;
}

/** Clamps every top-level `$limit` to `max` and guarantees the pipeline ends with one. */
export function enforceLimit(pipeline: Document[], max = 100): Document[] {
  const clamped = pipeline.map((stage) => ('$limit' in stage ? { $limit: clampLimit(stage.$limit, max) } : stage));
  const last = clamped.at(-1);
  return last && '$limit' in last ? clamped : [...clamped, { $limit: max }];
}

export function validatePipeline(pipeline: unknown, opts: { allowedCollections?: string[] }): PipelineValidation {
  if (!Array.isArray(pipeline)) return { ok: false, error: 'Pipeline must be an array of stages' };

  for (const [index, stage] of pipeline.entries()) {
    if (!isPlainObject(stage) || Object.keys(stage).length !== 1) {
      return { ok: false, error: `Stage ${index} must be an object with exactly one operator` };
    }
  }

  const violation = findViolation(pipeline, opts.allowedCollections);
  if (violation) return { ok: false, error: violation };
  return { ok: true, pipeline: enforceLimit(pipeline as Document[]) };
}

/** Validates a filter, projection or similar query document against the operator denylist. */
export function validateQueryDocument(value: unknown, label: string): DocumentValidation {
  if (!isPlainObject(value)) return { ok: false, error: `${label} must be an object` };
  const violation = findViolation(value);
  if (violation) return { ok: false, error: `${label}: ${violation}` };
  return { ok: true, document: value };
}
