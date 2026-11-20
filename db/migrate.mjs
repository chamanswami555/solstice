/**
 * Applies db/migrations/*.sql in name order. Each file runs in one transaction and is recorded in
 * schema_migrations, so a second run applies nothing. An advisory lock makes two runs at the same
 * time safe.
 *
 * Command line: npm run db:migrate        (reads DATABASE_URL)
 *               npm run db:migrate:live   (reads DATABASE_URL_DIRECT, the hosted database)
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
  // The hosted database has its own setting, so the everyday command can never reach it by mistake.
  const live = process.argv.includes("--live");
  const setting = live ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
  const databaseUrl = process.env[setting];
  if (!databaseUrl) {
    console.error(`${setting} is not set. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  if (live) {
    const host = new URL(databaseUrl).host;
    // A pooled address gives each statement another connection, and the migration lock needs one.
    if (host.includes("-pooler")) {
      console.error("DATABASE_URL_DIRECT is a pooled address. Use the direct address of the database.");
      process.exit(1);
    }
    console.log(`Database host: ${host}`);
  }
  try {
    const applied = await migrate(databaseUrl);
    console.log(applied.length === 0 ? "No new migration." : `Applied: ${applied.join(", ")}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
