import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate.mjs";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

/** Runs the migration command with only the given database settings. USER is the default database user. */
function run(args: string[], settings: Record<string, string>) {
  const env = { NODE_ENV: "test" as const, PATH: process.env.PATH, USER: process.env.USER, ...settings };
  const done = spawnSync("node", ["db/migrate.mjs", ...args], { env, encoding: "utf8" });
  return { status: done.status, output: done.stdout + done.stderr };
}

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
});

describe("the migration command", () => {
  it("uses DATABASE_URL by default", () => {
    const done = run([], { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_DIRECT: "postgres://nobody@host.invalid/none" });

    expect(done).toMatchObject({ status: 0, output: expect.stringContaining("No new migration.") });
  });

  it("uses DATABASE_URL_DIRECT with --live and names the host before it runs", () => {
    const done = run(["--live"], { DATABASE_URL: "postgres://nobody@host.invalid/none", DATABASE_URL_DIRECT: TEST_DATABASE_URL });

    expect(done.status).toBe(0);
    expect(done.output).toContain("Database host: localhost:5432");
    expect(done.output).toContain("No new migration.");
  });

  it("refuses --live when DATABASE_URL_DIRECT is not set", () => {
    const done = run(["--live"], { DATABASE_URL: TEST_DATABASE_URL });

    expect(done).toMatchObject({ status: 1, output: expect.stringContaining("DATABASE_URL_DIRECT is not set") });
  });

  it("refuses a pooled address with --live, and does not show the password", () => {
    const done = run(["--live"], { DATABASE_URL_DIRECT: "postgres://app:hunter2secret@ep-name-123456-pooler.region.example.tech/db" });

    expect(done).toMatchObject({ status: 1, output: expect.stringContaining("pooled address") });
    expect(done.output).not.toContain("hunter2secret");
  });
});
