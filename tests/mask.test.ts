import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { drawRoom } from "@/lib/draw";
import { LIMITS } from "@/lib/limits";
import { getMaskThreads, postMaskMessage } from "@/lib/mask";
import { revealNext } from "@/lib/reveal";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { parseMaskMessage } from "@/lib/validate";
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

type Drawn = { code: string; people: Record<string, string>; receiverOf: Record<string, string>; giverOf: Record<string, string> };

/** A drawn room with Anita (organizer), Rohan, Meera and Kabir. `receiverOf.Anita` is the name Anita gives to. */
async function drawnRoom(): Promise<Drawn> {
  const room = await createRoom(officeRoom, null, pool);
  const people: Record<string, string> = { Anita: room.personId };
  for (const name of ["Rohan", "Meera", "Kabir"]) people[name] = (await joinRoom(room.code, name, null, pool)).personId;
  await drawRoom(room.code, people.Anita, pool);
  const receiverOf: Record<string, string> = {};
  const giverOf: Record<string, string> = {};
  for (const name of Object.keys(people)) {
    receiverOf[name] = (await getRoomState(room.code, people[name], pool))!.draw.receiverName!;
    giverOf[receiverOf[name]] = name;
  }
  return { code: room.code, people, receiverOf, giverOf };
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

describe("mask talk", () => {
  it("gives a member two empty threads after the draw: one with the receiver by name, one with a giver with no name", async () => {
    const { code, people, receiverOf } = await drawnRoom();

    const threads = await getMaskThreads(code, people.Anita, pool);

    expect(threads).toEqual({
      giving: { side: "giving", withName: receiverOf.Anita, muted: false, mutedByMe: false, messages: [] },
      receiving: { side: "receiving", withName: null, muted: false, mutedByMe: false, messages: [] },
    });
  });

  it("carries a message from the giver to the receiver and hides who wrote it", async () => {
    const { code, people, receiverOf } = await drawnRoom();
    const receiver = receiverOf.Anita;

    const posted = await postMaskMessage(code, people.Anita, "giving", "What size do you wear?", pool);

    expect(posted.otherPersonId).toBe(people[receiver]);
    expect(posted.thread.messages).toEqual([{ id: expect.any(Number), mine: true, body: "What size do you wear?", sentAt: expect.any(String) }]);
    const seen = (await getMaskThreads(code, people[receiver], pool))!;
    expect(seen.receiving).toEqual({
      side: "receiving",
      withName: null,
      muted: false,
      mutedByMe: false,
      messages: [{ id: expect.any(Number), mine: false, body: "What size do you wear?", sentAt: expect.any(String) }],
    });
    // Nothing in the receiver's answer names the giver: no name, no person id, and only the allowed fields.
    const answer = JSON.stringify(seen);
    expect(answer).not.toContain("Anita");
    expect(answer).not.toContain(people.Anita);
    expect(Object.keys(seen.receiving!).sort()).toEqual(["messages", "muted", "mutedByMe", "side", "withName"]);
    expect(Object.keys(seen.receiving!.messages[0]).sort()).toEqual(["body", "id", "mine", "sentAt"]);
  });

  it("carries the answer of the receiver back to the giver", async () => {
    const { code, people, receiverOf } = await drawnRoom();
    const receiver = receiverOf.Anita;
    await postMaskMessage(code, people.Anita, "giving", "What size do you wear?", pool);

    const posted = await postMaskMessage(code, people[receiver], "receiving", "Medium.", pool);

    expect(posted.otherPersonId).toBe(people.Anita);
    const seen = (await getMaskThreads(code, people.Anita, pool))!;
    expect(seen.giving!.messages.map((message) => [message.mine, message.body])).toEqual([
      [true, "What size do you wear?"],
      [false, "Medium."],
    ]);
  });

  it("shows a thread to its two people only", async () => {
    const { code, people, receiverOf } = await drawnRoom();
    await postMaskMessage(code, people.Anita, "giving", "A secret question", pool);

    for (const name of Object.keys(people)) {
      const answer = JSON.stringify(await getMaskThreads(code, people[name], pool));
      expect(answer.includes("A secret question")).toBe(name === "Anita" || name === receiverOf.Anita);
    }
  });

  it("shows the giver's name in the thread after the last pair of the reveal, and not before", async () => {
    const { code, people, giverOf } = await drawnRoom();
    for (let step = 0; step < 3; step += 1) await revealNext(code, people.Anita, step, pool);
    expect((await getMaskThreads(code, people.Rohan, pool))!.receiving!.withName).toBeNull();

    await revealNext(code, people.Anita, 3, pool);

    expect((await getMaskThreads(code, people.Rohan, pool))!.receiving!.withName).toBe(giverOf.Rohan);
  });

  it("has no thread before the draw, and none for a guest", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const rohan = await joinRoom(room.code, "Rohan", null, pool);
    const meera = await joinRoom(room.code, "Meera", null, pool);

    expect(await getMaskThreads(room.code, rohan.personId, pool)).toEqual({ giving: null, receiving: null });
    expect(await outcome(postMaskMessage(room.code, rohan.personId, "giving", "Hello", pool))).toBe("NO_THREAD");

    await drawRoom(room.code, room.personId, pool);
    const guest = await joinRoom(room.code, "Kabir", null, pool);
    expect(await getMaskThreads(room.code, guest.personId, pool)).toEqual({ giving: null, receiving: null });
    expect(await outcome(postMaskMessage(room.code, guest.personId, "receiving", "Hello", pool))).toBe("NO_THREAD");
    expect(meera.personId).toBeTruthy();
  });

  it("gives a person outside the room nothing", async () => {
    const { code } = await drawnRoom();
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await getMaskThreads(code, stranger.personId, pool)).toBeNull();
    expect(await outcome(postMaskMessage(code, stranger.personId, "giving", "Hello", pool))).toBe("ROOM_NOT_FOUND");
    expect(Number((await pool.query("select count(*) from mask_messages")).rows[0].count)).toBe(0);
  });

  it("refuses a message in a muted thread", async () => {
    const { code, people } = await drawnRoom();
    await pool.query("update pairs set muted_by = 'receiver'");

    expect(await outcome(postMaskMessage(code, people.Anita, "giving", "Hello", pool))).toBe("THREAD_MUTED");
    expect((await getMaskThreads(code, people.Anita, pool))!.giving).toMatchObject({ muted: true, mutedByMe: false });
    expect((await getMaskThreads(code, people.Anita, pool))!.receiving).toMatchObject({ muted: true, mutedByMe: true });
  });

  it(`refuses message ${LIMITS.maskPerMinute + 1} of one member in a minute, across both threads`, async () => {
    const { code, people } = await drawnRoom();
    for (let sent = 0; sent < LIMITS.maskPerMinute; sent += 1) {
      await postMaskMessage(code, people.Anita, sent % 2 === 0 ? "giving" : "receiving", `Message ${sent + 1}`, pool);
    }

    expect(await outcome(postMaskMessage(code, people.Anita, "giving", "One too many", pool))).toBe("RATE_LIMITED");
    expect(await outcome(postMaskMessage(code, people.Rohan, "giving", "Another member is not limited", pool))).toBe("done");
  });

  it("waits for the sender's lock, so two posts cannot both take the last place of the minute", async () => {
    const { code, people } = await drawnRoom();
    const holder = await pool.connect();
    await holder.query("begin");
    const me = await holder.query("select m.id, m.room_id from members m where m.person_id = $1 for update", [people.Anita]);

    const post = outcome(postMaskMessage(code, people.Anita, "giving", "The last one", pool));
    await waitForLockWaiter();
    await holder.query(
      "insert into mask_messages (room_id, giver_id, from_giver, body) select $1, $2, true, 'filler' from generate_series(1, $3)",
      [me.rows[0].room_id, me.rows[0].id, LIMITS.maskPerMinute],
    );
    await holder.query("commit");
    holder.release();

    expect(await post).toBe("RATE_LIMITED");
  });
});

describe("the mask_messages table", () => {
  it("refuses a message for a pair that does not exist, and a text over the cap", async () => {
    const { code } = await drawnRoom();
    const pair = (await pool.query("select p.room_id, p.giver_id from pairs p join rooms r on r.id = p.room_id where r.code = $1 limit 1", [code])).rows[0];
    const insert = (giverId: number, body: string) =>
      pool.query("insert into mask_messages (room_id, giver_id, from_giver, body) values ($1, $2, true, $3)", [pair.room_id, giverId, body]).then(
        () => "no error",
        (error) => error.code,
      );

    expect(await insert(999_999, "Hello")).toBe("23503");
    expect(await insert(pair.giver_id, "m".repeat(LIMITS.maskTextMax + 1))).toBe("23514");
    expect(await insert(pair.giver_id, "m".repeat(LIMITS.maskTextMax))).toBe("no error");
  });
});

describe("parseMaskMessage", () => {
  it("accepts a side and a text, and trims the text", () => {
    expect(parseMaskMessage({ side: "giving", text: "  What size? " })).toEqual({ ok: true, value: { side: "giving", text: "What size?" } });
  });

  it.each([[{ side: "both", text: "Hi" }], [{ text: "Hi" }], [null]])("refuses the side of %j", (body) => {
    expect(parseMaskMessage(body)).toMatchObject({ ok: false, fields: { side: expect.any(String) } });
  });

  it.each([[""], ["   "], ["m".repeat(1001)], [42]])("refuses the text %j", (text) => {
    expect(parseMaskMessage({ side: "giving", text })).toMatchObject({ ok: false, fields: { text: expect.any(String) } });
  });

  it("refuses a text with a word from the word list, in any letter case and next to punctuation", () => {
    expect(parseMaskMessage({ side: "giving", text: "You are a BASTARD!" })).toMatchObject({ ok: false, fields: { text: "Use kinder words. This message was not sent." } });
    expect(parseMaskMessage({ side: "giving", text: "A class on Scunthorpe history" })).toMatchObject({ ok: true });
  });
});
