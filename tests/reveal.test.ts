import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { drawRoom } from "@/lib/draw";
import { revealNext } from "@/lib/reveal";
import { isBeforeExchangeDate, ringOrder } from "@/lib/reveal-rules";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const officeRoom = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" as const, exchangeDate: null, budget: null };

async function outcome(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "done";
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
}

/** A drawn room with the organizer Anita and the named joiners. Returns each person id by display name. */
async function drawnRoom(names: string[]): Promise<{ code: string; people: Record<string, string> }> {
  const room = await createRoom(officeRoom, null, pool);
  const people: Record<string, string> = { Anita: room.personId };
  for (const name of names) people[name] = (await joinRoom(room.code, name, null, pool)).personId;
  await drawRoom(room.code, people.Anita, pool);
  return { code: room.code, people };
}

async function storedStep(): Promise<number> {
  return (await pool.query("select reveal_step from rooms")).rows[0].reveal_step;
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

describe("revealNext", () => {
  it("shows no pair before the organizer starts the reveal", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);

    for (const personId of Object.values(people)) {
      expect((await getRoomState(code, personId, pool))?.reveal).toEqual({ step: 0, total: 4, pairs: [] });
    }
  });

  it("moves the reveal by one pair and shows the same pair to every person in the room", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);
    const guest = await joinRoom(code, "Sana", null, pool);

    expect(await revealNext(code, people.Anita, 0, pool)).toEqual({ step: 1, total: 4 });

    const first = (await pool.query(
      `select giver.display_name as giver, receiver.display_name as receiver
         from pairs p join members giver on giver.id = p.giver_id join members receiver on receiver.id = p.receiver_id
        where p.position = 1`,
    )).rows[0];
    for (const personId of [...Object.values(people), guest.personId]) {
      const state = await getRoomState(code, personId, pool);
      expect(state?.reveal).toEqual({ step: 1, total: 4, pairs: [{ giverName: first.giver, receiverName: first.receiver }] });
    }
  });

  it("moves one step for two taps that carry the same step", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);

    await revealNext(code, people.Anita, 0, pool);
    const second = await revealNext(code, people.Anita, 0, pool);

    expect(second).toEqual({ step: 1, total: 4 });
    expect(await storedStep()).toBe(1);
  });

  it("moves one step for two taps at the same time", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);

    const results = await Promise.all([revealNext(code, people.Anita, 0, pool), revealNext(code, people.Anita, 0, pool)]);

    expect(results).toEqual([{ step: 1, total: 4 }, { step: 1, total: 4 }]);
    expect(await storedStep()).toBe(1);
  });

  it("does not move for a tap that is ahead of the room", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);

    expect(await revealNext(code, people.Anita, 2, pool)).toEqual({ step: 0, total: 4 });
  });

  it("stops at the last pair", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera"]);
    for (let step = 0; step < 3; step += 1) await revealNext(code, people.Anita, step, pool);

    expect(await revealNext(code, people.Anita, 3, pool)).toEqual({ step: 3, total: 3 });
    expect(await storedStep()).toBe(3);
  });

  it("shows the pairs in the order of their position, and all of them make one ring", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera", "Kabir"]);
    for (let step = 0; step < 4; step += 1) await revealNext(code, people.Anita, step, pool);

    const reveal = (await getRoomState(code, people.Meera, pool))!.reveal;

    const byPosition = (await pool.query(
      "select giver.display_name as giver from pairs p join members giver on giver.id = p.giver_id order by p.position",
    )).rows.map((row) => row.giver);
    expect(reveal.pairs.map((pair) => pair.giverName)).toEqual(byPosition);
    expect(Object.keys(reveal.pairs[0]).sort()).toEqual(["giverName", "receiverName"]);
    const ring = ringOrder(reveal.pairs);
    expect(ring.map((pair) => pair.giverName).sort()).toEqual(["Anita", "Kabir", "Meera", "Rohan"]);
    ring.forEach((pair, index) => expect(pair.receiverName).toBe(ring[(index + 1) % ring.length].giverName));
  });

  it("refuses a member who is not the organizer", async () => {
    const { code, people } = await drawnRoom(["Rohan", "Meera"]);

    expect(await outcome(revealNext(code, people.Rohan, 0, pool))).toBe("NOT_ORGANIZER");
    expect(await storedStep()).toBe(0);
  });

  it("answers a person outside the room as if the room did not exist", async () => {
    const { code } = await drawnRoom(["Rohan", "Meera"]);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await outcome(revealNext(code, stranger.personId, 0, pool))).toBe("ROOM_NOT_FOUND");
  });

  it("refuses a reveal before the draw", async () => {
    const room = await createRoom(officeRoom, null, pool);

    expect(await outcome(revealNext(room.code, room.personId, 0, pool))).toBe("NOT_DRAWN");
    expect((await getRoomState(room.code, room.personId, pool))?.reveal).toEqual({ step: 0, total: 0, pairs: [] });
  });
});

describe("isBeforeExchangeDate", () => {
  it("is true on the evening before the exchange", () => {
    expect(isBeforeExchangeDate("2026-12-24", new Date(2026, 11, 23, 23, 59))).toBe(true);
  });

  it("is false from the first minute of the exchange day", () => {
    expect(isBeforeExchangeDate("2026-12-24", new Date(2026, 11, 24, 0, 0))).toBe(false);
  });

  it("is false after the exchange, also across a year end", () => {
    expect(isBeforeExchangeDate("2026-12-24", new Date(2027, 0, 2, 9, 0))).toBe(false);
  });

  it("is false for a room with no date", () => {
    expect(isBeforeExchangeDate(null, new Date(2026, 11, 1))).toBe(false);
  });
});

describe("ringOrder", () => {
  it("puts each pair after the pair that gives to its giver", () => {
    const shuffledPairs = [
      { giverName: "Meera", receiverName: "Anita" },
      { giverName: "Anita", receiverName: "Kabir" },
      { giverName: "Rohan", receiverName: "Meera" },
      { giverName: "Kabir", receiverName: "Rohan" },
    ];

    expect(ringOrder(shuffledPairs).map((pair) => pair.giverName)).toEqual(["Meera", "Anita", "Kabir", "Rohan"]);
  });

  it("gives nothing for no pairs", () => {
    expect(ringOrder([])).toEqual([]);
  });
});
