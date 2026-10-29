import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { validateQueryDocument } from '../validate.js';
import { assertCollectionAllowed, fromEjson, READ_ONLY_ANNOTATIONS, respond, type ToolContext } from './shared.js';

export function registerCount(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'count',
    {
      description: 'Count the documents in a collection that match an optional filter.',
      inputSchema: z.object({
        collection: z.string().min(1),
        filter: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ collection, filter }) =>
      respond(async () => {
        assertCollectionAllowed(ctx, collection);
        const validated = validateQueryDocument(filter ?? {}, 'filter');
        if (!validated.ok) throw new Error(validated.error);
        const count = await ctx.db
          .collection(collection)
          .countDocuments(fromEjson(validated.document), { maxTimeMS: ctx.maxTimeMS });
        return { count };
      }),
  );
}
