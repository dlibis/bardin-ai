import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_SQL_PATH = path.resolve(__dirname, 'schema.sql');

export interface QueryResult<T = any> {
  rows: T[];
}

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PGliteDatabaseClient implements DatabaseClient {
  private db: PGlite;

  constructor(db?: PGlite) {
    this.db = db || new PGlite();
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.db.query<T>(sql, params);
    return { rows: res.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (pgliteTx: any) => {
      const txClient: DatabaseClient = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const res = await pgliteTx.query(sql, params);
          return { rows: res.rows };
        },
        exec: async (sql: string) => {
          await pgliteTx.exec(sql);
        },
        transaction: async <R>(nestedFn: (nestedTx: DatabaseClient) => Promise<R>) => {
          return await nestedFn(txClient);
        },
        close: async () => {},
      };
      return await fn(txClient);
    });
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

class PgPoolDatabaseClient implements DatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pool.query<any>(sql, params);
    return { rows: res.rows as T[] };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DatabaseClient = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const res = await client.query<any>(sql, params);
          return { rows: res.rows as R[] };
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
        transaction: async <R>(nestedFn: (nestedTx: DatabaseClient) => Promise<R>) => {
          return await nestedFn(txClient);
        },
        close: async () => {},
      };
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createDatabaseClient(options?: {
  connectionString?: string;
  inMemory?: boolean;
}): Promise<DatabaseClient> {
  const connectionString = options?.connectionString || process.env.DATABASE_URL;
  let client: DatabaseClient;

  if (connectionString && !options?.inMemory) {
    client = new PgPoolDatabaseClient(connectionString);
  } else {
    client = new PGliteDatabaseClient();
  }

  const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf-8');
  await client.exec(schemaSql);
  return client;
}

let defaultClientPromise: Promise<DatabaseClient> | null = null;

export function getDatabaseClient(): Promise<DatabaseClient> {
  if (!defaultClientPromise) {
    defaultClientPromise = createDatabaseClient();
  }
  return defaultClientPromise;
}
