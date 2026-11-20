import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { startDemoRoom } from "@/lib/demo";
import { drawRoom } from "@/lib/draw";
import { getMaskThreads, postMaskMessage } from "@/lib/mask";
import { saveNote } from "@/lib/notes";
import { revealNext } from "@/lib/reveal";
import { closeRoomTalk, openRoomTalk } from "@/lib/room-talk";
import { createRoom, getRoomState, joinRoom, removeMember, RoomError } from "@/lib/rooms";
import { saveWishes } from "@/lib/wishes";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const keys = { appKey: "abc123def456", appSecret: "s3cr3tValue9876543210", region: "sg" as const };
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

function transport() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ code: 0, result: { accessToken: "token" } }), { status: 200 });
  };
  return { calls, send: send as typeof fetch };
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

describe("removeMember", () => {
  it("takes the member out of the room and returns who it was", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);
    await saveWishes(code, people.Rohan, ["A warm scarf"], pool);

    expect(await removeMember(code, people.Anita, "rohan", pool)).toBe(people.Rohan);

    const state = (await getRoomState(code, people.Anita, pool))!;
    expect(state.members.map((member) => member.displayName)).toEqual(["Anita", "Meera", "Kabir"]);
    expect(Number((await pool.query("select count(*) from wishes")).rows[0].count)).toBe(0);
  });

  it("leaves the removed person with nothing on every route of the room", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);
    await removeMember(code, people.Anita, "Rohan", pool);
    const { calls, send } = transport();

    expect(await getRoomState(code, people.Rohan, pool)).toBeNull();
    expect(await getMaskThreads(code, people.Rohan, pool)).toBeNull();
    expect(await outcome(saveWishes(code, people.Rohan, ["A scarf"], pool))).toBe("ROOM_NOT_FOUND");
    expect(await outcome(openRoomTalk(code, people.Rohan, pool, keys, send))).toBe("ROOM_NOT_FOUND");
    expect(calls).toEqual([]);

    await drawRoom(code, people.Anita, pool);
    expect(Number((await pool.query("select count(*) from pairs")).rows[0].count)).toBe(3);
    expect(await getRoomState(code, people.Rohan, pool)).toBeNull();
    expect(await getMaskThreads(code, people.Rohan, pool)).toBeNull();
    for (const refused of [
      drawRoom(code, people.Rohan, pool),
      revealNext(code, people.Rohan, 0, pool),
      saveNote(code, people.Rohan, "A note", pool),
      postMaskMessage(code, people.Rohan, "giving", "Hello", pool),
    ]) {
      expect(await outcome(refused)).toBe("ROOM_NOT_FOUND");
    }
  });

  it("keeps the removed person from joining again, also after the draw", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera", "Kabir"]);
    await removeMember(code, people.Anita, "Rohan", pool);

    expect(await outcome(joinRoom(code, "Rohan again", people.Rohan, pool))).toBe("REMOVED");
    await drawRoom(code, people.Anita, pool);
    expect(await outcome(joinRoom(code, "Rohan again", people.Rohan, pool))).toBe("REMOVED");
    expect((await getRoomState(code, people.Anita, pool))!.members).toHaveLength(3);
  });

  it("lets only the organizer remove", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);

    expect(await outcome(removeMember(code, people.Rohan, "Meera", pool))).toBe("NOT_ORGANIZER");
    expect(await outcome(removeMember(code, stranger.personId, "Meera", pool))).toBe("ROOM_NOT_FOUND");
    expect((await getRoomState(code, people.Anita, pool))!.members).toHaveLength(3);
  });

  it("refuses after the draw, for the organizer's own name and for a name that is not in the room", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);

    expect(await outcome(removeMember(code, people.Anita, "Anita", pool))).toBe("CANNOT_REMOVE_ORGANIZER");
    expect(await outcome(removeMember(code, people.Anita, "Nobody", pool))).toBe("MEMBER_NOT_FOUND");

    await drawRoom(code, people.Anita, pool);
    expect(await outcome(removeMember(code, people.Anita, "Rohan", pool))).toBe("ALREADY_DRAWN");
    expect((await getRoomState(code, people.Rohan, pool))!.draw.drawn).toBe(true);
  });

  it("waits for the room lock and then sees a draw that was made meanwhile", async () => {
    const { code, people } = await roomWith(["Rohan", "Meera"]);
    const holder = await pool.connect();
    await holder.query("begin");
    const locked = await holder.query("select id from rooms where code = $1 for update", [code]);

    const removal = outcome(removeMember(code, people.Anita, "Rohan", pool));
    await waitForLockWaiter();
    await holder.query("insert into draws (room_id) values ($1)", [locked.rows[0].id]);
    await holder.query("commit");
    holder.release();

    expect(await removal).toBe("ALREADY_DRAWN");
  });

  it("removes nobody from a demo room", async () => {
    const demo = await startDemoRoom(null, pool);

    expect(await outcome(removeMember(demo.code, demo.personId, "Asha", pool))).toBe("DEMO_ROOM");
  });
});

describe("closeRoomTalk", () => {
  it("takes the person out of the channel of the room and ends their tokens", async () => {
    const { calls, send } = transport();
    const before = Date.now();

    await closeRoomTalk("ROOMCODE", "p0000000000000000000000ab", keys, send);

    expect(calls[0]).toEqual({ path: "/v4/group-channel/leave", body: { channelId: "ROOMCODE", userIds: ["p0000000000000000000000ab"] } });
    expect(calls[1].path).toBe("/v4/auth/access-token/expire");
    expect(calls[1].body.userIds).toEqual(["p0000000000000000000000ab"]);
    expect(Number(calls[1].body.expiresAt)).toBeGreaterThanOrEqual(before);
  });

  it("does not throw when the chat service fails, and does nothing with chat switched off", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = (async () => new Response(JSON.stringify({ code: 1004 }), { status: 200 })) as typeof fetch;
    const { calls, send } = transport();

    await closeRoomTalk("ROOMCODE", "p0000000000000000000000ab", keys, failing);
    await closeRoomTalk("ROOMCODE", "p0000000000000000000000ab", null, send);

    expect(logged).toHaveBeenCalled();
    expect(calls).toEqual([]);
    logged.mockRestore();
  });
});
