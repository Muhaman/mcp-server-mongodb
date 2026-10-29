import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { inferSchema } from '../schema.js';
import { assertCollectionAllowed, READ_ONLY_ANNOTATIONS, respond, sampleDocuments, type ToolContext } from './shared.js';

export async function describeCollection(ctx: ToolContext, collection: string, sampleSize: number) {
  assertCollectionAllowed(ctx, collection);
  const [docs, estimatedCount] = await Promise.all([
    sampleDocuments(ctx, collection, sampleSize),
    ctx.db.collection(collection).estimatedDocumentCount({ maxTimeMS: ctx.maxTimeMS }),
  ]);
  return { collection, estimatedCount, sampledDocuments: docs.length, fields: inferSchema(docs) };
}

export function registerDescribeCollection(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'describe_collection',
    {
      description:
        'Infer the schema of a collection from a random sample: per-field BSON types and the fraction of sampled documents containing each field.',
      inputSchema: z.object({
        collection: z.string().min(1),
        sampleSize: z.number().int().min(1).max(500).default(50),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ collection, sampleSize }) => respond(() => describeCollection(ctx, collection, sampleSize)),
  );
}
