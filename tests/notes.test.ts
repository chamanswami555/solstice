import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { drawRoom } from "@/lib/draw";
import { LIMITS } from "@/lib/limits";
import { saveNote } from "@/lib/notes";
import { revealNext } from "@/lib/reveal";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { parseNote, type CreateRoomInput } from "@/lib/validate";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const tonight: CreateRoomInput = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight", exchangeDate: null, budget: null };

async function outcome(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "done";
  } catch (error) {
    if (error instanceof RoomError) return error.code;
    throw error;
  }
}

type Drawn = { code: string; people: Record<string, string>; receiverOf: Record<string, string> };

/** A drawn tonight round with Anita (organizer), Rohan and Meera. */
async function drawnRoom(room: CreateRoomInput = tonight): Promise<Drawn> {
  const made = await createRoom(room, null, pool);
  const people: Record<string, string> = { Anita: made.personId };
  for (const name of ["Rohan", "Meera"]) people[name] = (await joinRoom(made.code, name, null, pool)).personId;
  await drawRoom(made.code, people.Anita, pool);
  const receiverOf: Record<string, string> = {};
  for (const name of Object.keys(people)) receiverOf[name] = (await getRoomState(made.code, people[name], pool))!.draw.receiverName!;
  return { code: made.code, people, receiverOf };
}

/** The giver whose pair is shown at the given reveal position. */
async function giverAt(position: number): Promise<string> {
  return (await pool.query("select giver.display_name as name from pairs p join members giver on giver.id = p.giver_id where p.position = $1", [position])).rows[0].name;
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

describe("saveNote", () => {
  it("stores the giver's note, shows it to the giver only, and counts it for the organizer only", async () => {
    const { code, people } = await drawnRoom();

    expect(await saveNote(code, people.Rohan, "A poem for you: roses are red.", pool)).toBe("A poem for you: roses are red.");

    expect((await getRoomState(code, people.Rohan, pool))!.note).toEqual({ mine: "A poem for you: roses are red.", open: true, notesIn: null });
    expect((await getRoomState(code, people.Anita, pool))!.note).toEqual({ mine: null, open: true, notesIn: 1 });
    for (const name of ["Anita", "Meera"]) {
      expect(JSON.stringify(await getRoomState(code, people[name], pool))).not.toContain("roses are red");
    }
  });

  it("replaces the note on a second save, and an empty text clears it", async () => {
    const { code, people } = await drawnRoom();
    await saveNote(code, people.Rohan, "First idea", pool);

    await saveNote(code, people.Rohan, "Second idea", pool);
    expect((await getRoomState(code, people.Rohan, pool))!.note.mine).toBe("Second idea");
    expect(await saveNote(code, people.Rohan, "", pool)).toBeNull();

    expect((await getRoomState(code, people.Rohan, pool))!.note.mine).toBeNull();
    expect(Number((await pool.query("select count(*) from gift_notes")).rows[0].count)).toBe(0);
  });

  it("shows the note of a pair to everyone when that pair is revealed, and null for a pair with no note", async () => {
    const { code, people } = await drawnRoom();
    const first = await giverAt(1);
    await saveNote(code, people[first], "Coffee is on me tomorrow.", pool);
    await saveNote(code, people[await giverAt(3)], "A note for later", pool);

    await revealNext(code, people.Anita, 0, pool);
    await revealNext(code, people.Anita, 1, pool);

    for (const personId of Object.values(people)) {
      const state = (await getRoomState(code, personId, pool))!;
      expect(state.reveal.pairs.map((pair) => pair.note)).toEqual(["Coffee is on me tomorrow.", null]);
      expect(Object.keys(state.reveal.pairs[0]).sort()).toEqual(["giverName", "note", "receiverName"]);
      if (personId !== people[await giverAt(3)]) expect(JSON.stringify(state)).not.toContain("A note for later");
    }
  });

  it("closes a giver's note when their own pair is revealed, and not before", async () => {
    const { code, people } = await drawnRoom();
    const first = await giverAt(1);
    const second = await giverAt(2);
    await revealNext(code, people.Anita, 0, pool);

    expect(await outcome(saveNote(code, people[first], "Too late", pool))).toBe("NOTE_CLOSED");
    expect((await getRoomState(code, people[first], pool))!.note.open).toBe(false);
    expect(await outcome(saveNote(code, people[second], "Still in time", pool))).toBe("done");
    expect((await getRoomState(code, people[second], pool))!.note.open).toBe(true);
  });

  it("waits for the room lock and then sees that the pair was revealed meanwhile", async () => {
    const { code, people } = await drawnRoom();
    const holder = await pool.connect();
    await holder.query("begin");
    await holder.query("select id from rooms where code = $1 for update", [code]);

    const save = outcome(saveNote(code, people.Rohan, "A late note", pool));
    await waitForLockWaiter();
    await holder.query("update rooms set reveal_step = 3 where code = $1", [code]);
    await holder.query("commit");
    holder.release();

    expect(await save).toBe("NOTE_CLOSED");
  });

  it("has no notes in a December room", async () => {
    const { code, people } = await drawnRoom({ ...tonight, kind: "december", exchangeDate: "2026-12-24" });

    expect(await outcome(saveNote(code, people.Rohan, "A note", pool))).toBe("NO_NOTES");
    expect((await getRoomState(code, people.Anita, pool))!.note).toEqual({ mine: null, open: false, notesIn: null });
  });

  it("refuses a note before the draw, from a guest and from a person outside the room", async () => {
    const room = await createRoom(tonight, null, pool);
    const rohan = await joinRoom(room.code, "Rohan", null, pool);
    await joinRoom(room.code, "Meera", null, pool);
    expect(await outcome(saveNote(room.code, rohan.personId, "Early", pool))).toBe("NOT_DRAWN");
    expect((await getRoomState(room.code, rohan.personId, pool))!.note.open).toBe(false);

    await drawRoom(room.code, room.personId, pool);
    const guest = await joinRoom(room.code, "Kabir", null, pool);
    const stranger = await createRoom({ ...tonight, roomName: "Other room" }, null, pool);

    expect(await outcome(saveNote(room.code, guest.personId, "From a guest", pool))).toBe("GUEST");
    expect(await outcome(saveNote(room.code, stranger.personId, "From outside", pool))).toBe("ROOM_NOT_FOUND");
  });
});

describe("the gift_notes table", () => {
  it("refuses a note over the cap, and a note of a member who is no giver in that room", async () => {
    const { code } = await drawnRoom();
    const pair = (await pool.query("select p.room_id, p.giver_id from pairs p join rooms r on r.id = p.room_id where r.code = $1 limit 1", [code])).rows[0];
    const insert = (giverId: number, body: string) =>
      pool.query("insert into gift_notes (room_id, giver_id, body) values ($1, $2, $3)", [pair.room_id, giverId, body]).then(
        () => "no error",
        (error) => error.code,
      );

    expect(await insert(pair.giver_id, "n".repeat(LIMITS.noteTextMax + 1))).toBe("23514");
    expect(await insert(999_999, "A note")).toBe("23503");
    expect(await insert(pair.giver_id, "n".repeat(LIMITS.noteTextMax))).toBe("no error");
    expect(await insert(pair.giver_id, "A second note")).toBe("23505");
  });
});

describe("parseNote", () => {
  it("trims the text, and takes an empty text as no note", () => {
    expect(parseNote({ text: "  A poem for you. " })).toEqual({ ok: true, value: { text: "A poem for you." } });
    expect(parseNote({ text: "   " })).toEqual({ ok: true, value: { text: "" } });
  });

  it.each([[{}], [null], [{ text: 42 }], [{ text: "n".repeat(501) }], [{ text: "You bastard" }]])("refuses %j", (body) => {
    expect(parseNote(body)).toMatchObject({ ok: false, fields: { text: expect.any(String) } });
  });
});
