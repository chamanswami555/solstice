/**
 * Applies db/migrations/*.sql in name order. Each file runs in one transaction and is recorded in
 * schema_migrations, so a second run applies nothing. An advisory lock makes two runs at the same
 * time safe.
 *
 * Command line: npm run db:migrate   (reads DATABASE_URL)
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));
const LOCK_KEY = 7_265_001;

/**
 * @param {string} databaseUrl
 * @returns {Promise<string[]>} the names of the files applied in this run
 */
export async function migrate(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await client.query("select name from schema_migrations")).rows.map((row) => row.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

    const applied = [];
    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(MIGRATIONS_DIR + name, "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [name]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${name} failed and was rolled back: ${error.message}`, { cause: error });
      }
      applied.push(name);
    }
    return applied;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Set it in .env.local (see .env.example).");
    process.exit(1);
  }
  try {
    const applied = await migrate(databaseUrl);
    console.log(applied.length === 0 ? "No new migration." : `Applied: ${applied.join(", ")}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
