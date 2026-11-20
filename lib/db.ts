import pg from "pg";
import { readConfig } from "@/lib/config";

// PostgreSQL bigint arrives as text by default. Our ids stay far below 2^53, so read them as numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

let pool: pg.Pool | undefined;

/** One connection pool for the server process. */
export function getPool(): pg.Pool {
  pool ??= createPool(readConfig().databaseUrl);
  return pool;
}

export function createPool(connectionString: string): pg.Pool {
  const created = new pg.Pool({ connectionString, max: 5 });
  // The database can drop an idle connection (restart, scale to zero, host suspend). With no
  // listener that event stops the whole process. The pool removes the connection by itself.
  created.on("error", (error) => console.error("Lost an idle database connection:", error.message));
  return created;
}

/**
 * Runs one user action as one transaction. The work commits as a whole, or rolls back as a whole
 * when it throws.
 */
export async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>, from: pg.Pool = getPool()): Promise<T> {
  const client = await from.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
