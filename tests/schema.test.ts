import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

let db: pg.Client;

/** Runs the statement and returns the PostgreSQL error code, or "no error". */
async function errorCode(sql: string, values: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, values);
    return "no error";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

async function addRoom(code: string): Promise<number> {
  await db.query("insert into people (id, return_hash) values ($1, $2) on conflict do nothing", [
    `organizer-${code}`,
    `hash-organizer-${code}`,
  ]);
  const room = await db.query(
    "insert into rooms (code, name, kind, organizer_id) values ($1, 'Office exchange', 'tonight', $2) returning id",
    [code, `organizer-${code}`],
  );
  return Number(room.rows[0].id);
}

async function addMember(roomId: number, name: string): Promise<number> {
  const personId = `person-${roomId}-${name}`;
  await db.query("insert into people (id, return_hash) values ($1, $2)", [personId, `hash-${personId}`]);
  const member = await db.query(
    "insert into members (room_id, person_id, display_name, role) values ($1, $2, $3, 'member') returning id",
    [roomId, personId, name],
  );
  return Number(member.rows[0].id);
}

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
});

beforeEach(async () => {
  await db.query("truncate pairs, draws, members, rooms, people restart identity cascade");
});

afterAll(async () => {
  await db.end();
});

describe("migrations", () => {
  it("applies nothing on a second run", async () => {
    const applied = await migrate(TEST_DATABASE_URL);

    expect(applied).toEqual([]);
  });
});

describe("schema rules", () => {
  it("refuses a display name that is already in the room, in any letter case", async () => {
    const room = await addRoom("ROOM01");
    await addMember(room, "Anita");

    await db.query("insert into people (id, return_hash) values ('person-2', 'hash-person-2')");

    const code = await errorCode(
      "insert into members (room_id, person_id, display_name, role) values ($1, 'person-2', 'ANITA', 'member')",
      [room],
    );

    expect(code).toBe(UNIQUE_VIOLATION);
  });

  it("allows the same display name in two rooms", async () => {
    const first = await addRoom("ROOM01");
    const second = await addRoom("ROOM02");
    await addMember(first, "Anita");

    await expect(addMember(second, "Anita")).resolves.toBeGreaterThan(0);
  });

  it("refuses a second draw for a room", async () => {
    const room = await addRoom("ROOM01");
    await db.query("insert into draws (room_id) values ($1)", [room]);

    expect(await errorCode("insert into draws (room_id) values ($1)", [room])).toBe(UNIQUE_VIOLATION);
  });

  it("refuses a member who gives to two receivers", async () => {
    const room = await addRoom("ROOM01");
    const [anita, rohan, meera] = [await addMember(room, "Anita"), await addMember(room, "Rohan"), await addMember(room, "Meera")];
    await db.query("insert into draws (room_id) values ($1)", [room]);
    await db.query("insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 1)", [room, anita, rohan]);

    const code = await errorCode(
      "insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 2)",
      [room, anita, meera],
    );

    expect(code).toBe(UNIQUE_VIOLATION);
  });

  it("refuses a member who receives from two givers", async () => {
    const room = await addRoom("ROOM01");
    const [anita, rohan, meera] = [await addMember(room, "Anita"), await addMember(room, "Rohan"), await addMember(room, "Meera")];
    await db.query("insert into draws (room_id) values ($1)", [room]);
    await db.query("insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 1)", [room, anita, meera]);

    const code = await errorCode(
      "insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 2)",
      [room, rohan, meera],
    );

    expect(code).toBe(UNIQUE_VIOLATION);
  });

  it("refuses a member who gives to themself", async () => {
    const room = await addRoom("ROOM01");
    const anita = await addMember(room, "Anita");
    await db.query("insert into draws (room_id) values ($1)", [room]);

    const code = await errorCode(
      "insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $2, 1)",
      [room, anita],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  it("refuses a pair with a member of another room", async () => {
    const first = await addRoom("ROOM01");
    const second = await addRoom("ROOM02");
    const anita = await addMember(first, "Anita");
    const outsider = await addMember(second, "Rohan");
    await db.query("insert into draws (room_id) values ($1)", [first]);

    const code = await errorCode(
      "insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 1)",
      [first, anita, outsider],
    );

    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("refuses pairs for a room that has no draw", async () => {
    const room = await addRoom("ROOM01");
    const [anita, rohan] = [await addMember(room, "Anita"), await addMember(room, "Rohan")];

    const code = await errorCode(
      "insert into pairs (room_id, giver_id, receiver_id, position) values ($1, $2, $3, 1)",
      [room, anita, rohan],
    );

    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });
});
