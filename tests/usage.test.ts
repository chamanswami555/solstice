import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { startDemoRoom } from "@/lib/demo";
import { drawRoom } from "@/lib/draw";
import { revealNext } from "@/lib/reveal";
import { createRoom, joinRoom } from "@/lib/rooms";
import { getUsage } from "@/lib/usage";
import type { CreateRoomInput } from "@/lib/validate";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const tonight: CreateRoomInput = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight", exchangeDate: null, budget: null };
const december: CreateRoomInput = { ...tonight, roomName: "Family exchange", kind: "december", exchangeDate: "2026-12-24" };
const empty = { rooms: 0, people: 0, draws: 0, reveals: 0 };

/** A room with the organizer and two more members. Returns the code and the organizer's person id. */
async function roomOfThree(input: CreateRoomInput, organizerId: string | null = null): Promise<{ code: string; organizer: string }> {
  const room = await createRoom(input, organizerId, pool);
  for (const name of ["Rohan", "Meera"]) await joinRoom(room.code, name, null, pool);
  return { code: room.code, organizer: room.personId };
}

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

describe("getUsage", () => {
  it("is all zero for an empty database", async () => {
    expect(await getUsage(pool)).toEqual({ december: empty, tonight: empty, demo: empty, people: 0 });
  });

  it("counts rooms, people, draws and finished reveals by kind of room, with demo rooms apart", async () => {
    // Tonight: one room revealed to the end, one drawn and half revealed, one with no draw.
    const finished = await roomOfThree(tonight);
    await drawRoom(finished.code, finished.organizer, pool);
    for (let step = 0; step < 3; step += 1) await revealNext(finished.code, finished.organizer, step, pool);
    const half = await roomOfThree(tonight);
    await drawRoom(half.code, half.organizer, pool);
    await revealNext(half.code, half.organizer, 0, pool);
    await roomOfThree(tonight);
    // December: one drawn room. Its organizer is the organizer of the first tonight room.
    const family = await roomOfThree(december, finished.organizer);
    await drawRoom(family.code, family.organizer, pool);
    // Demo: one room of a new visitor, drawn and revealed, and one of a person who is also in a real room.
    const visitor = await startDemoRoom(null, pool);
    await drawRoom(visitor.code, visitor.personId, pool);
    for (let step = 0; step < 4; step += 1) await revealNext(visitor.code, visitor.personId, step, pool);
    await startDemoRoom(half.organizer, pool);

    expect(await getUsage(pool)).toEqual({
      tonight: { rooms: 3, people: 9, draws: 2, reveals: 1 },
      december: { rooms: 1, people: 3, draws: 1, reveals: 0 },
      // Demo members are no people: a demo room has one person, its visitor.
      demo: { rooms: 2, people: 2, draws: 1, reveals: 1 },
      // 9 in tonight rounds, 2 more in the December room (its organizer is counted once), 1 demo visitor.
      people: 12,
    });
  });
});
