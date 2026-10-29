import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };

let mongod: MongoMemoryServer;
let mongo: MongoClient;
const clients: Client[] = [];

async function connect(allowlist?: string[]): Promise<Client> {
  const server = createServer(mongo.db('test'), { allowlist, maxTimeMS: 5000 });
  const client = new Client({ name: 'test-harness', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

function json<T>(result: ToolResult): T {
  const text = result.content.find((block) => block.type === 'text')?.text ?? '';
  return JSON.parse(text) as T;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  mongo = await MongoClient.connect(mongod.getUri());
  const db = mongo.db('test');
  await db.collection('movies').insertMany(
    Array.from({ length: 150 }, (_, i) => ({ i, title: `Synthetic Movie ${i}`, year: 1950 + (i % 50) })),
  );
  await db.collection('secrets').insertOne({ token: 'synthetic-secret' });
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.close()));
  await mongo.close();
  await mongod.stop();
});

describe('tools', () => {
  it('registers the documented tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'aggregate',
      'count',
      'describe_collection',
      'find',
      'list_collections',
    ]);
  });

  it('list_collections respects the allowlist', async () => {
    const restricted = await connect(['movies']);
    expect(json<string[]>(await call(restricted, 'list_collections', {}))).toEqual(['movies']);

    const open = await connect();
    expect(json<string[]>(await call(open, 'list_collections', {}))).toEqual(['movies', 'secrets']);
  });

  it('find caps limit at 100', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'find', { collection: 'movies', limit: 500 });
    expect(result.isError).toBeFalsy();
    expect(json<unknown[]>(result)).toHaveLength(100);
  });

  it('find defaults to 20 documents and honours sort and projection', async () => {
    const client = await connect(['movies']);
    const defaulted = await call(client, 'find', { collection: 'movies' });
    expect(json<unknown[]>(defaulted)).toHaveLength(20);

    const top = await call(client, 'find', {
      collection: 'movies',
      sort: { i: -1 },
      projection: { _id: 0, i: 1 },
      limit: 1,
    });
    expect(json<unknown[]>(top)).toEqual([{ i: 149 }]);
  });

  it('find on a non-allowlisted collection is an error', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'find', { collection: 'secrets' });
    expect(result.isError).toBe(true);
  });

  it('find rejects $where filters', async () => {
    const client = await connect();
    const result = await call(client, 'find', { collection: 'movies', filter: { $where: 'true' } });
    expect(result.isError).toBe(true);
  });

  it('count applies the filter', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'count', { collection: 'movies', filter: { year: 1950 } });
    expect(json<{ count: number }>(result)).toEqual({ count: 3 });
  });

  it('aggregate with $out is an error and writes nothing', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'aggregate', { collection: 'movies', pipeline: [{ $out: 'copy' }] });
    expect(result.isError).toBe(true);
    const names = (await mongo.db('test').listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain('copy');
  });

  it('aggregate rejects $lookup into a non-allowlisted collection', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'aggregate', {
      collection: 'movies',
      pipeline: [{ $lookup: { from: 'secrets', pipeline: [], as: 'leak' } }],
    });
    expect(result.isError).toBe(true);
  });

  it('aggregate runs a valid pipeline and caps the result size', async () => {
    const client = await connect(['movies']);
    const grouped = await call(client, 'aggregate', {
      collection: 'movies',
      pipeline: [{ $group: { _id: '$year', n: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 1 }],
    });
    expect(json<unknown[]>(grouped)).toEqual([{ _id: 1950, n: 3 }]);

    const all = await call(client, 'aggregate', { collection: 'movies', pipeline: [{ $match: {} }] });
    expect(json<unknown[]>(all)).toHaveLength(100);
  });

  it('describe_collection infers a schema from a sample', async () => {
    const client = await connect(['movies']);
    const result = await call(client, 'describe_collection', { collection: 'movies', sampleSize: 20 });
    const description = json<{ estimatedCount: number; fields: Record<string, { types: string[] }> }>(result);
    expect(description.estimatedCount).toBe(150);
    expect(description.fields.year?.types).toEqual(['number']);
    expect(description.fields._id?.types).toEqual(['objectId']);
  });
});

describe('schema resource', () => {
  it('serves mongodb://schema/{collection}', async () => {
    const client = await connect(['movies']);
    const { contents } = await client.readResource({ uri: 'mongodb://schema/movies' });
    const first = contents[0];
    const fields = JSON.parse(first && 'text' in first ? first.text : '{}') as Record<string, unknown>;
    expect(fields).toHaveProperty('title');
  });

  it('refuses collections outside the allowlist', async () => {
    const client = await connect(['movies']);
    await expect(client.readResource({ uri: 'mongodb://schema/secrets' })).rejects.toThrow();
  });
});
