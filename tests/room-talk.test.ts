import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "@/db/migrate.mjs";
import { NexconnError } from "@/lib/nexconn-server";
import { openRoomTalk, TALK_SYSTEM_USER } from "@/lib/room-talk";
import { createRoom, getRoomState, joinRoom, RoomError } from "@/lib/rooms";
import { resetTestDatabase, TEST_DATABASE_URL } from "./helpers/test-database";

let pool: pg.Pool;

const keys = { appKey: "abc123def456", appSecret: "s3cr3tValue9876543210", region: "sg" as const };
const officeRoom = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" as const, exchangeDate: null, budget: null };

type Call = { path: string; body: Record<string, unknown> };

/** A transport that records each call and answers each path with the next canned answer for it. */
function nexconn(answers: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: JSON.parse(String(init?.body)) });
    const next = answers[path]?.shift();
    if (!next) throw new Error(`no canned answer for ${path}`);
    return new Response(JSON.stringify(next), { status: 200 });
  };
  return { calls, send: send as typeof fetch };
}

const ISSUE = "/v4/auth/access-token/issue";
const JOIN = "/v4/group-channel/join";
const CREATE = "/v4/group-channel/create";
const token = { code: 0, result: { accessToken: "token-of-the-member", userId: "any" } };
const ok = { code: 0 };

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

describe("openRoomTalk", () => {
  it("issues the member's token and joins the channel of the room", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const { calls, send } = nexconn({ [ISSUE]: [token], [JOIN]: [ok] });

    const access = await openRoomTalk(room.code, room.personId, pool, keys, send);

    expect(access).toEqual({ appKey: "abc123def456", region: "sg", userId: room.personId, token: "token-of-the-member", channelId: room.code });
    expect(calls).toEqual([
      { path: ISSUE, body: { userId: room.personId, name: "Anita" } },
      { path: JOIN, body: { channelId: room.code, userIds: [room.personId] } },
    ]);
    expect(JSON.stringify(access)).not.toContain("s3cr3tValue9876543210");
  });

  it("creates the channel when the room has none yet", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const { calls, send } = nexconn({ [ISSUE]: [token], [JOIN]: [{ code: 25410 }], [CREATE]: [ok] });

    await openRoomTalk(room.code, room.personId, pool, keys, send);

    expect(calls[2]).toEqual({
      path: CREATE,
      body: { channelId: room.code, name: "Office exchange 2026", owner: TALK_SYSTEM_USER, userIds: [room.personId] },
    });
  });

  it("joins again when another member made the channel in the same moment", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const { calls, send } = nexconn({ [ISSUE]: [token], [JOIN]: [{ code: 25410 }, ok], [CREATE]: [{ code: 25409 }] });

    const access = await openRoomTalk(room.code, room.personId, pool, keys, send);

    expect(calls.map((call) => call.path)).toEqual([ISSUE, JOIN, CREATE, JOIN]);
    expect(access.channelId).toBe(room.code);
  });

  it("gives a person outside the room nothing, and calls nothing", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const stranger = await createRoom({ ...officeRoom, roomName: "Other room" }, null, pool);
    const { calls, send } = nexconn({});

    const failure = await openRoomTalk(room.code, stranger.personId, pool, keys, send).catch((error) => error);

    expect(failure).toBeInstanceOf(RoomError);
    expect(failure.code).toBe("ROOM_NOT_FOUND");
    expect(calls).toEqual([]);
  });

  it("refuses when chat is switched off, and calls nothing", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const { calls, send } = nexconn({});

    const failure = await openRoomTalk(room.code, room.personId, pool, null, send).catch((error) => error);

    expect(failure.code).toBe("CHAT_OFF");
    expect(calls).toEqual([]);
  });

  it("passes on a refusal of Nexconn that is not about the channel", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const { send } = nexconn({ [ISSUE]: [token], [JOIN]: [{ code: 1004 }] });

    await expect(openRoomTalk(room.code, room.personId, pool, keys, send)).rejects.toBeInstanceOf(NexconnError);
  });
});

describe("getRoomState", () => {
  it("gives each member the talk id that the chat messages carry", async () => {
    const room = await createRoom(officeRoom, null, pool);
    const rohan = await joinRoom(room.code, "Rohan", null, pool);

    const state = await getRoomState(room.code, rohan.personId, pool);

    expect(state?.me.talkId).toBe(rohan.personId);
    expect(state?.members.map((member) => [member.displayName, member.talkId])).toEqual([
      ["Anita", room.personId],
      ["Rohan", rohan.personId],
    ]);
  });
});
