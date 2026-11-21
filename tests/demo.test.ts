import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { DEMO_MEMBERS, DEMO_QUESTION, DEMO_REPLY, startDemoRoom } from "@/lib/demo";
import { drawRoom } from "@/lib/draw";
import { getMaskThreads, postMaskMessage } from "@/lib/mask";
import { saveNote } from "@/lib/notes";
import { revealNext } from "@/lib/reveal";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const count = async (table: string) => Number((await pool.query(`select count(*) from ${table}`)).rows[0].count);

beforeAll(async () => {
  await resetTestDatabase();
  await migrate(TEST_DATABASE_URL);
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
});

beforeEach(async () => {
  await pool.query("truncate pairs, draws, members, rooms, people restart identity cascade");
});

afterAll(async () => {
  await pool.end();
});

describe("startDemoRoom", () => {
  it("makes a room for one visitor with three demo members that have wishes and are no people", async () => {
    const demo = await startDemoRoom(null, pool);

    const state = (await getRoomState(demo.code, demo.personId, pool))!;
    expect(state.room).toMatchObject({ kind: "demo", name: "Demo room" });
    expect(state.me).toMatchObject({ displayName: "Visitor", isOrganizer: true, isDemo: false });
    expect(state.members.map((member) => [member.displayName, member.isDemo, member.isOrganizer])).toEqual([
      ["Visitor", false, true],
      ...DEMO_MEMBERS.map((member) => [member.name, true, false]),
    ]);
    expect(demo.returnSecret).toBeTruthy();
    expect(await count("people")).toBe(1);
    expect(await count("wishes")).toBe(DEMO_MEMBERS.reduce((total, member) => total + member.wishes.length, 0));
    // A demo member has an id for the screen that is no person id.
    expect(state.members.filter((member) => member.isDemo).every((member) => member.talkId.startsWith("demo"))).toBe(true);
  });

  it("starts again: the new room takes the place of the old one, for the same person", async () => {
    const first = await startDemoRoom(null, pool);
    await drawRoom(first.code, first.personId, pool);

    const second = await startDemoRoom(first.personId, pool);

    expect(second.personId).toBe(first.personId);
    expect(second.returnSecret).toBeNull();
    expect(second.code).not.toBe(first.code);
    expect(await getRoomState(first.code, first.personId, pool)).toBeNull();
    expect(await count("rooms")).toBe(1);
    expect(await count("pairs")).toBe(0);
    expect((await getRoomState(second.code, second.personId, pool))!.draw.drawn).toBe(false);
  });

  it("leaves a real room of the same person alone", async () => {
    const real = await createRoom({ roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight", exchangeDate: null, budget: null }, null, pool);

    await startDemoRoom(real.personId, pool);
    await startDemoRoom(real.personId, pool);

    expect(await getRoomState(real.code, real.personId, pool)).not.toBeNull();
    expect(await count("rooms")).toBe(2);
  });
});

describe("a demo room plays the other members", () => {
  it("draws with the visitor in the ring, and gives each demo giver a note", async () => {
    const demo = await startDemoRoom(null, pool);

    const cards = await drawRoom(demo.code, demo.personId, pool);

    const state = (await getRoomState(demo.code, demo.personId, pool))!;
    expect(DEMO_MEMBERS.map((member) => member.name)).toContain(state.draw.receiverName);
    // Demo members have no chat identity: only the visitor gets a draw card in room talk.
    expect(cards).toEqual([{ personId: demo.personId, receiverName: state.draw.receiverName }]);
    expect(state.wishes.receiver).toEqual(DEMO_MEMBERS.find((member) => member.name === state.draw.receiverName)!.wishes);
    expect(state.note).toEqual({ mine: null, open: true, notesIn: 3 });
  });

  it("has one question from the secret giver in the visitor's thread after the draw", async () => {
    const demo = await startDemoRoom(null, pool);
    await drawRoom(demo.code, demo.personId, pool);

    const threads = (await getMaskThreads(demo.code, demo.personId, pool))!;

    expect(threads.receiving!.withName).toBeNull();
    expect(threads.receiving!.messages.map((message) => [message.mine, message.body])).toEqual([[false, DEMO_QUESTION]]);
    expect(threads.giving!.messages).toEqual([]);
    // Only the thread of the visitor gets the question. Threads between two demo members stay empty.
    expect(await count("mask_messages")).toBe(1);
  });

  it("answers the visitor's question in the same request, and has nobody to signal", async () => {
    const demo = await startDemoRoom(null, pool);
    await drawRoom(demo.code, demo.personId, pool);

    const posted = await postMaskMessage(demo.code, demo.personId, "giving", "What size do you wear?", pool);
    const answered = await postMaskMessage(demo.code, demo.personId, "receiving", "Tea, please.", pool);

    expect(posted.otherPersonId).toBeNull();
    expect(posted.thread.messages.map((message) => [message.mine, message.body])).toEqual([
      [true, "What size do you wear?"],
      [false, DEMO_REPLY],
    ]);
    // The thread with the secret giver gets no machine answer: the fixed question is the demo of that side.
    expect(answered.thread.messages.map((message) => message.body)).toEqual([DEMO_QUESTION, "Tea, please."]);
  });

  it("marks the visitor's own message as mine in the thread with a demo secret giver", async () => {
    const demo = await startDemoRoom(null, pool);
    await drawRoom(demo.code, demo.personId, pool);

    const answered = await postMaskMessage(demo.code, demo.personId, "receiving", "Tea, please.", pool);

    expect(answered.thread.messages.find((message) => message.body === "Tea, please.")?.mine).toBe(true);
    expect(answered.thread.messages.find((message) => message.body === DEMO_QUESTION)?.mine).toBe(false);
  });

  it("reveals four pairs with the notes of the demo givers and the visitor's own note", async () => {
    const demo = await startDemoRoom(null, pool);
    await drawRoom(demo.code, demo.personId, pool);
    await saveNote(demo.code, demo.personId, "A song for you.", pool);

    for (let step = 0; step < 4; step += 1) await revealNext(demo.code, demo.personId, step, pool);

    const state = (await getRoomState(demo.code, demo.personId, pool))!;
    expect(state.reveal.pairs).toHaveLength(4);
    for (const pair of state.reveal.pairs) {
      expect(pair.note).toBe(pair.giverName === "Visitor" ? "A song for you." : DEMO_MEMBERS.find((member) => member.name === pair.giverName)!.note);
    }
    expect((await getMaskThreads(demo.code, demo.personId, pool))!.receiving!.withName).toBeTruthy();
  });

  it("takes no second person: a demo room is for one visitor", async () => {
    const demo = await startDemoRoom(null, pool);

    const failure = await joinRoom(demo.code, "Rohan", null, pool).catch((error) => error);

    expect(failure).toBeInstanceOf(RoomError);
    expect(failure.code).toBe("DEMO_ROOM");
    expect(await count("people")).toBe(1);
  });

  it("seeds nothing in a real room", async () => {
    const real = await createRoom({ roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight", exchangeDate: null, budget: null }, null, pool);
    for (const name of ["Rohan", "Meera"]) await joinRoom(real.code, name, null, pool);

    await drawRoom(real.code, real.personId, pool);

    expect(await count("gift_notes")).toBe(0);
    expect(await count("mask_messages")).toBe(0);
  });
});

describe("the demo rules in the database", () => {
  it("refuses a demo member with a person, a real member with no person, and a second demo room of one person", async () => {
    const demo = await startDemoRoom(null, pool);
    const room = (await pool.query("select id from rooms where code = $1", [demo.code])).rows[0].id;
    const code = (sql: string, values: unknown[]) => pool.query(sql, values).then(() => "no error", (error) => error.code);

    expect(await code("insert into members (room_id, person_id, display_name, role, is_demo) values ($1, $2, 'Extra', 'member', true)", [room, demo.personId])).toBe("23514");
    expect(await code("insert into members (room_id, person_id, display_name, role) values ($1, null, 'Nobody', 'member')", [room])).toBe("23514");
    expect(await code("insert into rooms (code, name, kind, organizer_id) values ('DEMOTWO2', 'Demo room', 'demo', $1)", [demo.personId])).toBe("23505");
  });
});
