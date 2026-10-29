import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { isCollectionAllowed, READ_ONLY_ANNOTATIONS, respond, type ToolContext } from './shared.js';

export async function allowedCollectionNames(ctx: ToolContext): Promise<string[]> {
  const infos = await ctx.db.listCollections({}, { nameOnly: true }).toArray();
  return infos
    .map((info) => info.name)
    .filter((name) => isCollectionAllowed(ctx, name))
    .sort();
}

export function registerListCollections(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_collections',
    {
      description: 'List the collections in the database that this server exposes.',
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => respond(() => allowedCollectionNames(ctx)),
  );
}
