import { describe, expect, it, vi } from "vitest";
import { TALK_SYSTEM_USER } from "@/lib/room-talk";
import { sendDrawCards, signalPerson, signalRoom } from "@/lib/signal";
import { DRAW_CARD_TYPE, SIGNAL_TYPE } from "@/lib/talk-rules";

const keys = { appKey: "abc123def456", appSecret: "s3cr3tValue9876543210", region: "sg" as const };

function transport(answer: unknown) {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  return { sent, send: send as typeof fetch };
}

describe("signalRoom", () => {
  it("sends one custom message with no room data to the channel of the room", async () => {
    const { sent, send } = transport({ code: 0, result: { messageIds: [] } });

    expect(await signalRoom("ROOMCODE", keys, send)).toBe(true);

    expect(sent).toEqual([
      {
        path: "/v4/group-channel/message/send",
        body: {
          fromUserId: TALK_SYSTEM_USER,
          toChannelIds: ["ROOMCODE"],
          messageType: SIGNAL_TYPE,
          content: JSON.stringify({ kind: "state" }),
          shouldPersist: 0,
          disablePush: true,
        },
      },
    ]);
  });

  it("does not throw when the chat service refuses, and says so in the log", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { send } = transport({ code: 25410 });

    expect(await signalRoom("ROOMCODE", keys, send)).toBe(false);

    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("does not throw when the network fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    expect(await signalRoom("ROOMCODE", keys, send)).toBe(false);

    logged.mockRestore();
  });

  it("sends nothing when chat is switched off", async () => {
    const { sent, send } = transport({ code: 0 });

    expect(await signalRoom("ROOMCODE", null, send)).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("signalPerson", () => {
  it("sends the signal to one person only, with no sender and no thread in it", async () => {
    const { sent, send } = transport({ code: 0, result: { messageIds: [] } });

    expect(await signalPerson("ROOMCODE", "p0000000000000000000000ab", keys, send)).toBe(true);

    expect(sent[0].body).toEqual({
      fromUserId: TALK_SYSTEM_USER,
      toChannelIds: ["ROOMCODE"],
      toUserIds: ["p0000000000000000000000ab"],
      messageType: SIGNAL_TYPE,
      content: JSON.stringify({ kind: "state" }),
      shouldPersist: 0,
      disablePush: true,
    });
  });
});

describe("sendDrawCards", () => {
  const cards = [
    { personId: "pAnita", receiverName: "Rohan" },
    { personId: "pRohan", receiverName: "Anita" },
  ];

  it("sends each giver one targeted message with only that giver's receiver", async () => {
    const { sent, send } = transport({ code: 0, result: { messageIds: [] } });

    expect(await sendDrawCards("ROOMCODE", cards, keys, send)).toBe(2);

    expect(sent.map((call) => call.body)).toEqual(
      cards.map((card) => ({
        fromUserId: TALK_SYSTEM_USER,
        toChannelIds: ["ROOMCODE"],
        toUserIds: [card.personId],
        messageType: DRAW_CARD_TYPE,
        content: JSON.stringify({ receiverName: card.receiverName }),
        shouldPersist: 0,
      })),
    );
    expect(new Set(sent.map((call) => call.path))).toEqual(new Set(["/v4/group-channel/message/send"]));
  });

  it("sends the next card when the chat service refuses one, and never throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const answers = [{ code: 25410 }, { code: 0, result: { messageIds: [] } }];
    const sent: unknown[] = [];
    const send = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(answers.shift()), { status: 200 });
    }) as typeof fetch;

    expect(await sendDrawCards("ROOMCODE", cards, keys, send)).toBe(1);

    expect(sent).toHaveLength(2);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("sends nothing when chat is switched off", async () => {
    const { sent, send } = transport({ code: 0 });

    expect(await sendDrawCards("ROOMCODE", cards, null, send)).toBe(0);
    expect(sent).toEqual([]);
  });
});
