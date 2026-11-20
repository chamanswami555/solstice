import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { clientKey, takeRateSlot } from "@/lib/rate";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const SECRET = "k3Jq9vXw2LmN8pRt5YbZ1cDf7GhS4aUe";
const from = (headers: Record<string, string>) => new Request("https://solstice.example/api/rooms", { method: "POST", headers });

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 8 });
});

beforeEach(async () => {
  await pool.query("truncate rate_counters");
});

afterAll(async () => {
  await pool.end();
});

describe("takeRateSlot", () => {
  it("gives the slots up to the limit and refuses the next one", async () => {
    const taken: boolean[] = [];
    for (let call = 0; call < 11; call += 1) taken.push(await takeRateSlot(pool, "rooms:a", 10, 3600));

    expect(taken).toEqual([...Array(10).fill(true), false]);
  });

  it("counts each key on its own", async () => {
    for (let call = 0; call < 3; call += 1) await takeRateSlot(pool, "rooms:a", 3, 3600);

    expect(await takeRateSlot(pool, "rooms:a", 3, 3600)).toBe(false);
    expect(await takeRateSlot(pool, "rooms:b", 3, 3600)).toBe(true);
  });

  it("gives exactly the limit to requests at the same time", async () => {
    const taken = await Promise.all(Array.from({ length: 25 }, () => takeRateSlot(pool, "rooms:a", 10, 3600)));

    expect(taken.filter(Boolean)).toHaveLength(10);
    expect((await pool.query("select count from rate_counters where key = 'rooms:a'")).rows[0].count).toBe(25);
  });

  it("starts again in the next time window", async () => {
    // Wait for the start of a 2 second window, so the two calls below are in one window.
    await new Promise((resolve) => setTimeout(resolve, 2000 - (Date.now() % 2000) + 50));
    expect(await takeRateSlot(pool, "rooms:a", 1, 2)).toBe(true);
    expect(await takeRateSlot(pool, "rooms:a", 1, 2)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect(await takeRateSlot(pool, "rooms:a", 1, 2)).toBe(true);
  });
});

describe("clientKey", () => {
  it("is the same for one address and differs between addresses, and does not hold the address", () => {
    const first = clientKey(from({ "x-forwarded-for": "203.0.113.7" }), "rooms", SECRET);

    expect(first).toBe(clientKey(from({ "x-forwarded-for": "203.0.113.7" }), "rooms", SECRET));
    expect(first).not.toBe(clientKey(from({ "x-forwarded-for": "203.0.113.8" }), "rooms", SECRET));
    expect(first).toMatch(/^rooms:[0-9a-f]{32}$/);
    expect(first).not.toContain("203.0.113.7");
  });

  it("takes the first address of a list, the one that the host saw", () => {
    expect(clientKey(from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "rooms", SECRET)).toBe(
      clientKey(from({ "x-forwarded-for": " 203.0.113.7" }), "rooms", SECRET),
    );
  });

  it("has no key for a request with no client address", () => {
    expect(clientKey(from({}), "rooms", SECRET)).toBeNull();
    expect(clientKey(from({ "x-forwarded-for": "   " }), "rooms", SECRET)).toBeNull();
  });

  it.each(["::1", "127.0.0.1", "::ffff:127.0.0.1"])("has no key for the machine's own address %s", (address) => {
    expect(clientKey(from({ "x-forwarded-for": address }), "rooms", SECRET)).toBeNull();
  });

  it("differs between two uses and between two secrets", () => {
    const request = from({ "x-forwarded-for": "203.0.113.7" });

    expect(clientKey(request, "rooms", SECRET)).not.toBe(clientKey(request, "other", SECRET));
    expect(clientKey(request, "rooms", SECRET)).not.toBe(clientKey(request, "rooms", `${SECRET}x`));
  });
});
