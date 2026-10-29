import { McpServer, ProtocolError, ProtocolErrorCode, ResourceTemplate } from '@modelcontextprotocol/server';
import type { Db } from 'mongodb';
import { inferSchema } from './schema.js';
import { registerAggregate } from './tools/aggregate.js';
import { registerCount } from './tools/count.js';
import { registerDescribeCollection } from './tools/describeCollection.js';
import { registerFind } from './tools/find.js';
import { allowedCollectionNames, registerListCollections } from './tools/listCollections.js';
import { isCollectionAllowed, sampleDocuments, type ToolContext } from './tools/shared.js';

const SCHEMA_SAMPLE_SIZE = 50;

export interface ServerOptions {
  allowlist?: string[];
  maxTimeMS: number;
}

export function createServer(db: Db, opts: ServerOptions): McpServer {
  const ctx: ToolContext = { db, allowlist: opts.allowlist, maxTimeMS: opts.maxTimeMS };
  const server = new McpServer({ name: 'mcp-server-mongodb', version: '0.1.0' });

  registerListCollections(server, ctx);
  registerDescribeCollection(server, ctx);
  registerFind(server, ctx);
  registerAggregate(server, ctx);
  registerCount(server, ctx);

  server.registerResource(
    'collection-schema',
    new ResourceTemplate('mongodb://schema/{collection}', {
      list: async () => ({
        resources: (await allowedCollectionNames(ctx)).map((name) => ({
          uri: `mongodb://schema/${name}`,
          name: `${name} schema`,
        })),
      }),
    }),
    {
      title: 'Collection schema',
      description: 'Inferred field types and presence for a collection, from a random sample.',
      mimeType: 'application/json',
    },
    async (uri, { collection }) => {
      const name = String(collection);
      if (!isCollectionAllowed(ctx, name)) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Collection "${name}" is not available`);
      }
      const docs = await sampleDocuments(ctx, name, SCHEMA_SAMPLE_SIZE);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(inferSchema(docs)) }] };
    },
  );

  return server;
}
