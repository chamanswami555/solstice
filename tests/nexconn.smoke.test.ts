/**
 * Smoke test on the real Nexconn app. It runs only with NEXCONN_SMOKE=1: `npm run test:smoke`.
 * It uses the same two user ids and one channel id on every run, so it adds no new identities.
 */
import { afterAll, describe, expect, it } from "vitest";
import { nexconnCall, NexconnError } from "@/lib/nexconn-server";
import { BLOCKED_WORDS } from "@/lib/word-list";

const USER_A = "solsticeSmokeA";
const USER_B = "solsticeSmokeB";
const CHANNEL = "solsticeSmokeRoom";
const WORD = "solsticesmokeword";
/** The answer for a channel id that is already in use. The token route treats it as "the room exists". */
const CHANNEL_EXISTS = 25409;

/** The code of a refusal, or 0 for a call that passed. */
async function codeOf(call: Promise<unknown>): Promise<number | null> {
  try {
    await call;
    return 0;
  } catch (error) {
    if (error instanceof NexconnError) return error.code;
    throw error;
  }
}

describe.skipIf(process.env.NEXCONN_SMOKE !== "1")("the real Nexconn app", () => {
  afterAll(async () => {
    await codeOf(nexconnCall("/v4/group-channel/dismiss", { channelId: CHANNEL }));
    await codeOf(nexconnCall("/v4/profanity-word/batch/remove", { words: [WORD] }));
  });

  it("issues an access token for each test user", async () => {
    for (const userId of [USER_A, USER_B]) {
      const issued = await nexconnCall<{ accessToken: string; userId: string }>("/v4/auth/access-token/issue", { userId, name: userId });

      expect(issued.userId).toBe(userId);
      expect(issued.accessToken.length).toBeGreaterThan(20);
    }
  });

  it("creates a group channel, and a join of a member that is already inside passes", async () => {
    const created = await codeOf(nexconnCall("/v4/group-channel/create", { channelId: CHANNEL, name: "Smoke room", owner: USER_A, userIds: [USER_B] }));
    const joined = await nexconnCall<{ channelId: string; memberCount: number }>("/v4/group-channel/join", { channelId: CHANNEL, userIds: [USER_B] });

    expect(created).toBe(0);
    expect(joined.channelId).toBe(CHANNEL);
    expect(joined.memberCount).toBe(2);
    const second = await codeOf(nexconnCall("/v4/group-channel/create", { channelId: CHANNEL, name: "Smoke room", owner: USER_A }));
    expect(second).toBe(CHANNEL_EXISTS);
  });

  it("sends a room message to the group", async () => {
    const sent = await nexconnCall<{ messageIds: { channelId: string; messageId: string }[] }>("/v4/group-channel/message/send", {
      fromUserId: USER_A,
      toChannelIds: [CHANNEL],
      messageType: "RC:TxtMsg",
      content: JSON.stringify({ content: "Smoke test message" }),
    });

    expect(sent.messageIds[0].channelId).toBe(CHANNEL);
    expect(sent.messageIds[0].messageId).toBeTruthy();
  });

  it("sends a targeted custom message that names one member", async () => {
    const sent = await nexconnCall<{ messageIds: { messageId: string }[] }>("/v4/group-channel/message/send", {
      fromUserId: USER_A,
      toChannelIds: [CHANNEL],
      toUserIds: [USER_B],
      messageType: "Solstice:Signal",
      content: JSON.stringify({ kind: "state" }),
      shouldPersist: 0,
      disablePush: true,
    });

    expect(sent.messageIds[0].messageId).toBeTruthy();
  });

  it("expires the tokens of a user", async () => {
    await nexconnCall("/v4/auth/access-token/expire", { userIds: [USER_B], expiresAt: Date.now() });
  });

  // Room talk goes from browser to browser through the chat service, so its own filter needs our list.
  // This run sends the list; a word that is already there stays. The service says a change takes about 15 minutes.
  it("gives the chat service the word list of the website for its profanity filter", async () => {
    await nexconnCall("/v4/profanity-word/batch/add", { words: BLOCKED_WORDS.map((word) => ({ word })) });
  });

  it("adds a profanity word with no payment card", async () => {
    await nexconnCall("/v4/profanity-word/batch/add", { words: [{ word: WORD }] });
  });
});
