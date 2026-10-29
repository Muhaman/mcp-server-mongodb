import { MongoClient, type Db } from 'mongodb';

export interface Connection {
  client: MongoClient;
  db: Db;
}

export async function connectDb(uri: string, dbName: string): Promise<Connection> {
  const client = await MongoClient.connect(uri, { appName: 'mcp-server-mongodb' });
  return { client, db: client.db(dbName) };
}
