import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { pino } from 'pino';
import { connectDb } from './db.js';
import { loadEnv } from './env.js';
import { createServer } from './server.js';

// stdout carries the MCP protocol, so every log line goes to stderr.
const log = pino({ name: 'mcp-server-mongodb' }, pino.destination(2));

async function main(): Promise<void> {
  const env = loadEnv();
  const { client, db } = await connectDb(env.MONGODB_URI, env.MONGODB_DB);
  const server = createServer(db, { allowlist: env.MCP_COLLECTION_ALLOWLIST, maxTimeMS: env.MCP_MAX_TIME_MS });

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await server.close();
    await client.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await server.connect(new StdioServerTransport());
  log.info({ db: env.MONGODB_DB, allowlist: env.MCP_COLLECTION_ALLOWLIST ?? null }, 'mcp server ready on stdio');
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
