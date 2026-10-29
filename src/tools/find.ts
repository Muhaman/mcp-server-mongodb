import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { validateQueryDocument } from '../validate.js';
import {
  assertCollectionAllowed,
  fromEjson,
  MAX_DOCUMENTS,
  READ_ONLY_ANNOTATIONS,
  respond,
  type ToolContext,
} from './shared.js';

function checked(value: unknown, label: string) {
  const result = validateQueryDocument(value, label);
  if (!result.ok) throw new Error(result.error);
  return fromEjson(result.document);
}

export function registerFind(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'find',
    {
      description: `Find documents in a collection. Returns at most ${MAX_DOCUMENTS} documents as Extended JSON. Filters may use Extended JSON such as {"$oid": "..."} or {"$date": "..."}.`,
      inputSchema: z.object({
        collection: z.string().min(1),
        filter: z.record(z.string(), z.unknown()).optional(),
        projection: z.record(z.string(), z.unknown()).optional(),
        sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
        limit: z.number().int().min(1).default(20),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ collection, filter, projection, sort, limit }) =>
      respond(async () => {
        assertCollectionAllowed(ctx, collection);
        return ctx.db
          .collection(collection)
          .find(checked(filter ?? {}, 'filter'), {
            projection: projection && checked(projection, 'projection'),
            sort,
            limit: Math.min(limit, MAX_DOCUMENTS),
            maxTimeMS: ctx.maxTimeMS,
          })
          .toArray();
      }),
  );
}
