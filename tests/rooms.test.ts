import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { hashReturnSecret } from "@/lib/identity";
import { findPersonByReturnSecret } from "@/lib/people";
import { createRoom, getRoomState } from "@/lib/rooms";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

async function count(table: "people" | "rooms" | "members"): Promise<number> {
  return Number((await pool.query(`select count(*) from ${table}`)).rows[0].count);
}

const officeRoom = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" as const, exchangeDate: null, budget: null };

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 3 });
});

beforeEach(async () => {
  await pool.query("truncate pairs, draws, members, rooms, people restart identity cascade");
});

afterAll(async () => {
  await pool.end();
});

describe("createRoom", () => {
  it("makes the person, the room and the organizer as its first member", async () => {
    const created = await createRoom(officeRoom, null, pool);

    expect(created.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(await count("people")).toBe(1);
    expect(await count("rooms")).toBe(1);
    const state = await getRoomState(created.code, created.personId, pool);
    expect(state).toMatchObject({
      room: { code: created.code, name: "Office exchange 2026", kind: "tonight" },
      me: { displayName: "Anita", isOrganizer: true },
      members: [{ displayName: "Anita", isOrganizer: true }],
    });
  });

  it("gives a new person a return secret and stores only its hash", async () => {
    const created = await createRoom(officeRoom, null, pool);

    expect(created.returnSecret).toBeTruthy();
    const stored = (await pool.query("select return_hash from people")).rows[0].return_hash;
    expect(stored).toBe(hashReturnSecret(created.returnSecret!));
    expect(stored).not.toContain(created.returnSecret!);
  });

  it("keeps the same person, with no new return secret, for a second room", async () => {
    const first = await createRoom(officeRoom, null, pool);

    const second = await createRoom({ ...officeRoom, roomName: "Family exchange" }, first.personId, pool);

    expect(second.personId).toBe(first.personId);
    expect(second.returnSecret).toBeNull();
    expect(await count("people")).toBe(1);
    expect(await count("rooms")).toBe(2);
  });

  it("makes a new person when the given person id is not in the database", async () => {
    const created = await createRoom(officeRoom, `p${"a".repeat(24)}`, pool);

    expect(created.personId).not.toBe(`p${"a".repeat(24)}`);
    expect(created.returnSecret).toBeTruthy();
  });

  it("leaves nothing behind when a step fails", async () => {
    const tooLong = { ...officeRoom, displayName: "N".repeat(31) };

    await expect(createRoom(tooLong, null, pool)).rejects.toThrow();

    expect(await count("people")).toBe(0);
    expect(await count("rooms")).toBe(0);
    expect(await count("members")).toBe(0);
  });
});

describe("getRoomState", () => {
  it("gives nothing to a person who is not in the room", async () => {
    const created = await createRoom(officeRoom, null, pool);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await getRoomState(created.code, stranger.personId, pool)).toBeNull();
  });

  it("gives nothing for a room code that does not exist", async () => {
    const created = await createRoom(officeRoom, null, pool);

    expect(await getRoomState("ZZZZZZZZ", created.personId, pool)).toBeNull();
  });

  it("returns only the fields on the allow-list", async () => {
    const created = await createRoom(officeRoom, null, pool);

    const state = await getRoomState(created.code, created.personId, pool);

    expect(Object.keys(state!).sort()).toEqual(["draw", "me", "members", "room"]);
    expect(Object.keys(state!.room).sort()).toEqual(["budget", "code", "exchangeDate", "kind", "name"]);
    expect(Object.keys(state!.members[0]).sort()).toEqual(["displayName", "isOrganizer", "role"]);
    expect(JSON.stringify(state)).not.toContain(created.personId);
  });
});

describe("findPersonByReturnSecret", () => {
  it("finds the person who owns the secret", async () => {
    const created = await createRoom(officeRoom, null, pool);

    expect(await findPersonByReturnSecret(created.returnSecret!, pool)).toBe(created.personId);
  });

  it("finds nobody for a wrong secret", async () => {
    await createRoom(officeRoom, null, pool);

    expect(await findPersonByReturnSecret("not-the-secret", pool)).toBeNull();
  });
});
