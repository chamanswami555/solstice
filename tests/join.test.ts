import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { inTransaction } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { ensurePerson, IDENTITY_CAP_LOCK } from "@/lib/people";
import { createRoom, getRoomDoor, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const officeRoom = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" as const, exchangeDate: null, budget: null };
const NAMES = ["Rohan", "Meera", "Kabir", "Sana", "Vikram", "Priya", "Arjun", "Neha", "Imran", "Divya"];

async function count(table: "people" | "members"): Promise<number> {
  return Number((await pool.query(`select count(*) from ${table}`)).rows[0].count);
}

/** The error code of a refused join, or "joined". */
async function outcome(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "joined";
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
}

/** Fills the room with members named "Guest 02", "Guest 03" and so on, until it has `total` people. */
async function fillRoom(code: string, total: number): Promise<void> {
  for (let n = 2; n <= total; n += 1) {
    await joinRoom(code, `Guest ${String(n).padStart(2, "0")}`, null, pool);
  }
}

/** Waits until some backend of the test database waits on a lock. Gives up after one second. */
async function waitForLockWaiter(): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    const waiting = await pool.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (waiting.rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 6 });
});

beforeEach(async () => {
  await pool.query("truncate pairs, draws, members, rooms, people restart identity cascade");
});

afterAll(async () => {
  await pool.end();
});

describe("joinRoom", () => {
  it("adds a new person as a member and gives a return secret one time", async () => {
    const room = await createRoom(officeRoom, null, pool);

    const joined = await joinRoom(room.code, "Rohan", null, pool);

    expect(joined.returnSecret).toBeTruthy();
    const state = await getRoomState(room.code, joined.personId, pool);
    expect(state?.me).toEqual({ displayName: "Rohan", isOrganizer: false, role: "member" });
    expect(state?.members.map((member) => member.displayName)).toEqual(["Anita", "Rohan"]);
  });

  it("keeps the person of the cookie and gives no new return secret", async () => {
    const first = await createRoom(officeRoom, null, pool);
    const other = await createRoom({ ...officeRoom, roomName: "Family exchange" }, null, pool);

    const joined = await joinRoom(other.code, "Anita from sales", first.personId, pool);

    expect(joined).toEqual({ personId: first.personId, returnSecret: null });
    expect(await count("people")).toBe(2);
  });

  it("changes nothing when a member joins the same room again", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const joined = await joinRoom(room.code, "Rohan", null, pool);

    const again = await joinRoom(room.code, "Another name", joined.personId, pool);

    expect(again).toEqual({ personId: joined.personId, returnSecret: null });
    expect(await count("members")).toBe(2);
  });

  it("adds a person who joins after the draw as a guest", async () => {
    const room = await createRoom(officeRoom, null, pool);
    await pool.query("insert into draws (room_id) select id from rooms where code = $1", [room.code]);

    const joined = await joinRoom(room.code, "Rohan", null, pool);

    expect((await getRoomState(room.code, joined.personId, pool))?.me.role).toBe("guest");
  });

  it("refuses a display name that is in the room, in any letter case, and keeps no new person", async () => {
    const room = await createRoom(officeRoom, null, pool);

    expect(await outcome(joinRoom(room.code, "ANITA", null, pool))).toBe("NAME_TAKEN");
    expect(await count("people")).toBe(1);
  });

  it("refuses a room code that does not exist", async () => {
    expect(await outcome(joinRoom("ZZZZZZZZ", "Rohan", null, pool))).toBe("ROOM_NOT_FOUND");
  });

  it(`refuses person number ${LIMITS.roomPeopleMax + 1}`, async () => {
    const room = await createRoom(officeRoom, null, pool);
    await fillRoom(room.code, LIMITS.roomPeopleMax);

    expect(await outcome(joinRoom(room.code, "One too many", null, pool))).toBe("ROOM_FULL");
    expect(await count("members")).toBe(LIMITS.roomPeopleMax);
  });

  it("lets only one of two people take the last place at the same time", async () => {
    const room = await createRoom(officeRoom, null, pool);
    await fillRoom(room.code, LIMITS.roomPeopleMax - 1);

    const results = await Promise.all([
      outcome(joinRoom(room.code, "Rohan", null, pool)),
      outcome(joinRoom(room.code, "Meera", null, pool)),
    ]);

    expect(results.sort()).toEqual(["ROOM_FULL", "joined"]);
    expect(await count("members")).toBe(LIMITS.roomPeopleMax);
  });

  it("waits for the room lock and then counts the people again", async () => {
    const room = await createRoom(officeRoom, null, pool);
    await fillRoom(room.code, LIMITS.roomPeopleMax - 1);
    const holder = await pool.connect();
    await holder.query("begin");
    const locked = await holder.query("select id from rooms where code = $1 for update", [room.code]);

    // The join starts while another writer holds the room. That writer takes the last place.
    const join = outcome(joinRoom(room.code, "Rohan", null, pool));
    await waitForLockWaiter();
    await holder.query("insert into people (id, return_hash) values ('person-last-place', 'hash-last-place')");
    await holder.query(
      "insert into members (room_id, person_id, display_name, role) values ($1, 'person-last-place', 'Meera', 'member')",
      [locked.rows[0].id],
    );
    await holder.query("commit");
    holder.release();

    expect(await join).toBe("ROOM_FULL");
    expect(await count("members")).toBe(LIMITS.roomPeopleMax);
  });

  it("lets only one of two people take the same name at the same time", async () => {
    const room = await createRoom(officeRoom, null, pool);

    const results = await Promise.all([
      outcome(joinRoom(room.code, "Rohan", null, pool)),
      outcome(joinRoom(room.code, "rohan", null, pool)),
    ]);

    expect(results.sort()).toEqual(["NAME_TAKEN", "joined"]);
    expect(await count("people")).toBe(2);
  });

  it("joins ten people at the same time with no lost row", async () => {
    const room = await createRoom(officeRoom, null, pool);

    const results = await Promise.all(NAMES.map((name) => outcome(joinRoom(room.code, name, null, pool))));

    expect(results).toEqual(NAMES.map(() => "joined"));
    expect(await count("members")).toBe(11);
  });
});

describe("getRoomDoor", () => {
  it("shows a person outside the room its name and nothing else", async () => {
    const room = await createRoom(officeRoom, null, pool);

    expect(await getRoomDoor(room.code, pool)).toEqual({ code: room.code, name: "Office exchange 2026" });
  });

  it("gives nothing for a room code that does not exist", async () => {
    expect(await getRoomDoor("ZZZZZZZZ", pool)).toBeNull();
  });
});

describe("the identity cap", () => {
  it("refuses a new identity when the cap is reached", async () => {
    await inTransaction((db) => ensurePerson(null, db, 1), pool);

    const second = inTransaction((db) => ensurePerson(null, db, 1), pool);

    expect(await outcome(second)).toBe("IDENTITY_CAP");
    expect(await count("people")).toBe(1);
  });

  it("lets only one of two new identities take the last place at the same time", async () => {
    const results = await Promise.all([
      outcome(inTransaction((db) => ensurePerson(null, db, 1), pool)),
      outcome(inTransaction((db) => ensurePerson(null, db, 1), pool)),
    ]);

    expect(results.sort()).toEqual(["IDENTITY_CAP", "joined"]);
    expect(await count("people")).toBe(1);
  });

  it("waits for the cap lock and then counts the identities again", async () => {
    const holder = await pool.connect();
    await holder.query("begin");
    await holder.query("select pg_advisory_xact_lock($1)", [IDENTITY_CAP_LOCK]);

    // The new identity starts while another writer holds the cap lock. That writer takes the last place.
    const second = outcome(inTransaction((db) => ensurePerson(null, db, 1), pool));
    await waitForLockWaiter();
    await holder.query("insert into people (id, return_hash) values ('person-last-place', 'hash-last-place')");
    await holder.query("commit");
    holder.release();

    expect(await second).toBe("IDENTITY_CAP");
    expect(await count("people")).toBe(1);
  });

  it("does not count against a person who is already known", async () => {
    const known = await inTransaction((db) => ensurePerson(null, db, 1), pool);

    const again = await inTransaction((db) => ensurePerson(known.personId, db, 1), pool);

    expect(again).toEqual({ personId: known.personId, returnSecret: null });
  });
});
