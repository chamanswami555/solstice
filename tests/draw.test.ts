import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { drawPairs, drawRoom, type Pair } from "@/lib/draw";
import { LIMITS } from "@/lib/limits";
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

/** A room with the organizer Anita and the named joiners. Returns each person id by display name. */
async function roomWith(names: string[]): Promise<{ code: string; people: Record<string, string> }> {
  const room = await createRoom(officeRoom, null, pool);
  const people: Record<string, string> = { Anita: room.personId };
  for (const name of names) people[name] = (await joinRoom(room.code, name, null, pool)).personId;
  return { code: room.code, people };
}

async function waitForLockWaiter(): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    const waiting = await pool.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (waiting.rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Follows giver to receiver from the first member and counts the steps back to the start. */
function ringLength(pairs: Pair[]): number {
  const next = new Map(pairs.map((pair) => [pair.giverId, pair.receiverId]));
  let steps = 0;
  let at = pairs[0].giverId;
  do {
    at = next.get(at)!;
    steps += 1;
  } while (at !== pairs[0].giverId && steps <= pairs.length);
  return steps;
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

describe("drawPairs", () => {
  it(`makes one ring for every size from 3 to ${LIMITS.roomPeopleMax}`, () => {
    for (let size = 3; size <= LIMITS.roomPeopleMax; size += 1) {
      const members = Array.from({ length: size }, (_, index) => index + 101);

      const pairs = drawPairs(members);

      expect(pairs.map((pair) => pair.giverId).sort()).toEqual([...members].sort());
      expect(pairs.map((pair) => pair.receiverId).sort()).toEqual([...members].sort());
      expect(pairs.every((pair) => pair.giverId !== pair.receiverId)).toBe(true);
      expect(ringLength(pairs)).toBe(size);
      expect(pairs.map((pair) => pair.position).sort((a, b) => a - b)).toEqual(members.map((_, index) => index + 1));
    }
  });

  it.each([0, 1, 2])("refuses a draw with %i members", (size) => {
    const members = Array.from({ length: size }, (_, index) => index + 1);

    expect(() => drawPairs(members)).toThrow(RoomError);
  });

  it("does not reveal the pairs in the order of the ring", () => {
    // In ring order, the giver of each revealed pair is the receiver of the pair before it.
    let chained = 0;
    let steps = 0;
    for (let run = 0; run < 200; run += 1) {
      const byPosition = drawPairs([1, 2, 3, 4, 5, 6]).sort((a, b) => a.position - b.position);
      for (let index = 1; index < byPosition.length; index += 1) {
        steps += 1;
        if (byPosition[index].giverId === byPosition[index - 1].receiverId) chained += 1;
      }
    }

    expect(chained / steps).toBeLessThan(0.5);
  });

  it("does not give the same ring every time", () => {
    const rings = new Set(Array.from({ length: 50 }, () => JSON.stringify(drawPairs([1, 2, 3, 4, 5]).map((pair) => [pair.giverId, pair.receiverId]).sort())));

    expect(rings.size).toBeGreaterThan(5);
  });
});

describe("drawRoom", () => {
  it("gives every member one receiver and shows each member only their own", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);

    await drawRoom(code, people.Anita, pool);

    const receivers: string[] = [];
    for (const [name, personId] of Object.entries(people)) {
      const state = await getRoomState(code, personId, pool);
      expect(state?.draw.drawn).toBe(true);
      expect(state?.draw.receiverName).not.toBe(name);
      expect(Object.keys(state!.draw).sort()).toEqual(["drawn", "receiverName"]);
      receivers.push(state!.draw.receiverName!);
    }
    expect(receivers.sort()).toEqual(["Anita", "Kabir", "Meera", "Rohan"]);
  });

  it("returns one draw card for each giver, with the same receiver that the giver's room state shows", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);

    const cards = await drawRoom(code, people.Anita, pool);

    expect(cards.map((card) => card.personId).sort()).toEqual(Object.values(people).sort());
    for (const card of cards) expect(card.receiverName).toBe((await getRoomState(code, card.personId, pool))!.draw.receiverName);
  });

  it("shows no receiver before the draw", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);

    expect((await getRoomState(code, people.Rohan, pool))?.draw).toEqual({ drawn: false, receiverName: null });
  });

  it("leaves a guest out of the ring", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    await drawRoom(code, people.Anita, pool);

    const guest = await joinRoom(code, "Kabir", null, pool);

    expect((await getRoomState(code, guest.personId, pool))?.draw).toEqual({ drawn: true, receiverName: null });
    expect(Number((await pool.query("select count(*) from pairs")).rows[0].count)).toBe(3);
  });

  it("refuses a member who is not the organizer", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);

    expect(await outcome(drawRoom(code, people.Rohan, pool))).toBe("NOT_ORGANIZER");
    expect(Number((await pool.query("select count(*) from draws")).rows[0].count)).toBe(0);
  });

  it("answers a person outside the room as if the room did not exist", async () => {
    const { code } = await roomWith(["Rohan", "Meera"]);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await outcome(drawRoom(code, stranger.personId, pool))).toBe("ROOM_NOT_FOUND");
  });

  it("refuses a draw with fewer than 3 members", async () => {
    const { code, people } = await roomWith(["Rohan"]);

    expect(await outcome(drawRoom(code, people.Anita, pool))).toBe("TOO_FEW_MEMBERS");
  });

  it("refuses a second draw", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    await drawRoom(code, people.Anita, pool);

    expect(await outcome(drawRoom(code, people.Anita, pool))).toBe("ALREADY_DRAWN");
    expect(Number((await pool.query("select count(*) from pairs")).rows[0].count)).toBe(3);
  });

  it("makes one draw from two requests at the same time", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);

    const results = await Promise.all([outcome(drawRoom(code, people.Anita, pool)), outcome(drawRoom(code, people.Anita, pool))]);

    expect(results.sort()).toEqual(["ALREADY_DRAWN", "done"]);
    expect(Number((await pool.query("select count(*) from pairs")).rows[0].count)).toBe(4);
  });

  it("waits for the room lock and then sees the draw of the other writer", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    const holder = await pool.connect();
    await holder.query("begin");
    const locked = await holder.query("select id from rooms where code = $1 for update", [code]);

    const draw = outcome(drawRoom(code, people.Anita, pool));
    await waitForLockWaiter();
    await holder.query("insert into draws (room_id) values ($1)", [locked.rows[0].id]);
    await holder.query("commit");
    holder.release();

    expect(await draw).toBe("ALREADY_DRAWN");
  });
});
