import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { drawRoom } from "@/lib/draw";
import { LIMITS } from "@/lib/limits";
import { revealNext } from "@/lib/reveal";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { parseWishes } from "@/lib/validate";
import { saveWishes } from "@/lib/wishes";
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

const wishesOf = async (code: string, personId: string) => (await getRoomState(code, personId, pool))!.wishes;

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

describe("saveWishes", () => {
  it("stores the wishes of a member in their order", async () => {
    const { code, people } = await roomWith(["Rohan"]);

    const saved = await saveWishes(code, people.Rohan, ["A warm scarf", "Filter coffee beans"], pool);

    expect(saved).toEqual(["A warm scarf", "Filter coffee beans"]);
    expect(await wishesOf(code, people.Rohan)).toEqual({ mine: ["A warm scarf", "Filter coffee beans"], receiver: null, open: true });
    expect((await wishesOf(code, people.Anita)).mine).toEqual([]);
  });

  it("replaces the whole list on a second save", async () => {
    const { code, people } = await roomWith(["Rohan"]);
    await saveWishes(code, people.Rohan, ["A warm scarf", "Filter coffee beans", "A notebook"], pool);

    await saveWishes(code, people.Rohan, ["A board game"], pool);

    expect((await wishesOf(code, people.Rohan)).mine).toEqual(["A board game"]);
    expect(Number((await pool.query("select count(*) from wishes")).rows[0].count)).toBe(1);
  });

  it("shows a giver the wishes of their receiver after the draw, and of nobody else", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    for (const name of Object.keys(people)) await saveWishes(code, people[name], [`Wish of ${name}`], pool);
    expect((await wishesOf(code, people.Anita)).receiver).toBeNull();

    await drawRoom(code, people.Anita, pool);

    for (const personId of Object.values(people)) {
      const state = (await getRoomState(code, personId, pool))!;
      expect(state.wishes.receiver).toEqual([`Wish of ${state.draw.receiverName}`]);
      expect(Object.keys(state.wishes).sort()).toEqual(["mine", "open", "receiver"]);
    }
  });

  it("shows a giver a change that the receiver makes after the draw", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    await drawRoom(code, people.Anita, pool);
    const receiverName = (await getRoomState(code, people.Anita, pool))!.draw.receiverName!;

    await saveWishes(code, people[receiverName], ["Something new"], pool);

    expect((await wishesOf(code, people.Anita)).receiver).toEqual(["Something new"]);
  });

  it("refuses a guest, who has no giver", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    await drawRoom(code, people.Anita, pool);
    const guest = await joinRoom(code, "Kabir", null, pool);

    expect(await outcome(saveWishes(code, guest.personId, ["A scarf"], pool))).toBe("GUEST");
    expect(await wishesOf(code, guest.personId)).toEqual({ mine: [], receiver: null, open: false });
  });

  it("answers a person outside the room as if the room did not exist", async () => {
    const { code } = await roomWith(["Rohan"]);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await outcome(saveWishes(code, stranger.personId, ["A scarf"], pool))).toBe("ROOM_NOT_FOUND");
    expect(Number((await pool.query("select count(*) from wishes")).rows[0].count)).toBe(0);
  });

  it("closes the wish list when the reveal starts", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    await saveWishes(code, people.Rohan, ["A warm scarf"], pool);
    await drawRoom(code, people.Anita, pool);
    await revealNext(code, people.Anita, 0, pool);

    expect(await outcome(saveWishes(code, people.Rohan, ["A late wish"], pool))).toBe("WISHES_CLOSED");
    expect(await wishesOf(code, people.Rohan)).toMatchObject({ mine: ["A warm scarf"], open: false });
  });

  it("waits for the room lock and then sees a reveal that started meanwhile", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    const holder = await pool.connect();
    await holder.query("begin");
    await holder.query("select id from rooms where code = $1 for update", [code]);

    const save = outcome(saveWishes(code, people.Rohan, ["A late wish"], pool));
    await waitForLockWaiter();
    await holder.query("update rooms set reveal_step = 1 where code = $1", [code]);
    await holder.query("commit");
    holder.release();

    expect(await save).toBe("WISHES_CLOSED");
  });
});

describe("the wishes table", () => {
  async function memberId(): Promise<number> {
    const { code } = await roomWith([]);
    return (await pool.query("select m.id from members m join rooms r on r.id = m.room_id where r.code = $1", [code])).rows[0].id;
  }
  const insert = (member: number, position: number, body: string) =>
    pool.query("insert into wishes (member_id, position, body) values ($1, $2, $3)", [member, position, body]).then(
      () => "no error",
      (error) => error.code,
    );

  it("refuses a sixth wish", async () => {
    expect(await insert(await memberId(), LIMITS.wishesMax + 1, "One too many")).toBe("23514");
  });

  it("refuses a wish that is too long, and an empty one", async () => {
    const member = await memberId();

    expect(await insert(member, 1, "w".repeat(LIMITS.wishTextMax + 1))).toBe("23514");
    expect(await insert(member, 1, "")).toBe("23514");
    expect(await insert(member, 1, "w".repeat(LIMITS.wishTextMax))).toBe("no error");
  });

  it("refuses two wishes at one position", async () => {
    const member = await memberId();
    await insert(member, 1, "First");

    expect(await insert(member, 1, "Second")).toBe("23505");
  });
});

describe("parseWishes", () => {
  it("trims each wish and drops the empty ones", () => {
    expect(parseWishes({ wishes: ["  A warm scarf ", "", "   ", "A notebook"] })).toEqual({ ok: true, value: { wishes: ["A warm scarf", "A notebook"] } });
  });

  it("accepts an empty list, which clears the wishes", () => {
    expect(parseWishes({ wishes: [] })).toEqual({ ok: true, value: { wishes: [] } });
  });

  it.each([[{}], [null], [{ wishes: "A scarf" }], [{ wishes: [1, 2] }], [{ wishes: ["1", "2", "3", "4", "5", "6"] }], [{ wishes: ["w".repeat(121)] }]])(
    "refuses %j",
    (body) => {
      expect(parseWishes(body)).toMatchObject({ ok: false, fields: { wishes: expect.any(String) } });
    },
  );
});
