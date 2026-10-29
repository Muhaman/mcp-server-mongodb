import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { validatePipeline } from '../validate.js';
import { assertCollectionAllowed, fromEjson, MAX_DOCUMENTS, READ_ONLY_ANNOTATIONS, respond, type ToolContext } from './shared.js';

export function registerAggregate(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'aggregate',
    {
      description: `Run a read-only aggregation pipeline. $out, $merge, $function, $accumulator and $where are rejected, $lookup/$graphLookup/$unionWith may only target exposed collections, and results are capped at ${MAX_DOCUMENTS} documents.`,
      inputSchema: z.object({
        collection: z.string().min(1),
        pipeline: z.array(z.record(z.string(), z.unknown())),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ collection, pipeline }) =>
      respond(async () => {
        assertCollectionAllowed(ctx, collection);
        const validated = validatePipeline(pipeline, { allowedCollections: ctx.allowlist });
        if (!validated.ok) throw new Error(validated.error);
        return ctx.db
          .collection(collection)
          .aggregate(validated.pipeline.map(fromEjson), { maxTimeMS: ctx.maxTimeMS })
          .toArray();
      }),
  );
}
