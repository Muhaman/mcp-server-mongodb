import { EJSON } from 'bson';
import type { Db, Document } from 'mongodb';

export interface ToolContext {
  db: Db;
  allowlist?: string[];
  maxTimeMS: number;
}

export const MAX_DOCUMENTS = 100;

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, openWorldHint: false } as const;

export function isCollectionAllowed(ctx: ToolContext, name: string): boolean {
  if (name.startsWith('system.')) return false;
  return ctx.allowlist === undefined || ctx.allowlist.includes(name);
}

export function assertCollectionAllowed(ctx: ToolContext, name: string): void {
  if (!isCollectionAllowed(ctx, name)) throw new Error(`Collection "${name}" is not available`);
}

/** Converts relaxed Extended JSON (e.g. `{"$oid": "..."}`) in tool input to BSON values. */
export function fromEjson(value: Document): Document {
  return EJSON.deserialize(value);
}

export async function sampleDocuments(ctx: ToolContext, collection: string, size: number): Promise<Document[]> {
  return ctx.db
    .collection(collection)
    .aggregate([{ $sample: { size } }], { maxTimeMS: ctx.maxTimeMS })
    .toArray();
}

/** Runs a tool body, serialising the result as Extended JSON text or reporting the failure as a tool error. */
export async function respond(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: EJSON.stringify(await run()) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text' as const, text: message }], isError: true as const };
  }
}
