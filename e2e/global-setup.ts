import { execFileSync } from "node:child_process";
import { resetTestDatabase, TEST_DATABASE_URL } from "../tests/helpers/test-database";

/**
 * Every browser test run starts from an empty test database with the current schema.
 * The migration runs as its own process, the same way as `npm run db:migrate`.
 */
export default async function globalSetup() {
  await resetTestDatabase();
  execFileSync("node", ["db/migrate.mjs"], { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "inherit" });
}
