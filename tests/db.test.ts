import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { createPool, inTransaction } from "@/lib/db";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

async function peopleCount(): Promise<number> {
  return Number((await pool.query("select count(*) from people")).rows[0].count);
}

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
});

afterAll(async () => {
  await pool.end();
});

describe("inTransaction", () => {
  it("commits the work and returns its result", async () => {
    const result = await inTransaction(async (client) => {
      await client.query("insert into people (id, return_hash) values ('person-commit', 'hash-commit')");
      return "saved";
    }, pool);

    expect(result).toBe("saved");
    expect(await peopleCount()).toBe(1);
  });

  it("rolls back every write when the work throws", async () => {
    const before = await peopleCount();

    const work = inTransaction(async (client) => {
      await client.query("insert into people (id, return_hash) values ('person-rollback', 'hash-rollback')");
      throw new Error("stop after the insert");
    }, pool);

    await expect(work).rejects.toThrow("stop after the insert");
    expect(await peopleCount()).toBe(before);
  });
});

describe("createPool", () => {
  it("stays up and connects again after the database drops an idle connection", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const served = createPool(TEST_DATABASE_URL);
    try {
      const idle = (await served.query("select pg_backend_pid() as pid")).rows[0].pid;

      await pool.query("select pg_terminate_backend($1)", [idle]);
      await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1), { timeout: 3000 });

      const after = (await served.query("select pg_backend_pid() as pid")).rows[0].pid;
      expect(after).not.toBe(idle);
    } finally {
      await served.end();
      logged.mockRestore();
    }
  });
});
