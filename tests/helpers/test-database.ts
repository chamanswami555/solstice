import pg from "pg";

/** Tests never use the development or the live database. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/solstice_test";

/** Empties the test database. Refuses any database whose name does not end in "_test". */
export async function resetTestDatabase(): Promise<void> {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refused: "${name}" is not a test database. The name must end in "_test".`);
  }
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("drop schema public cascade; create schema public;");
  } finally {
    await client.end();
  }
}
