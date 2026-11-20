import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nexconnCall, NexconnError } from "@/lib/nexconn-server";

const keys = { appKey: "abc123def456", appSecret: "s3cr3tValue9876543210", region: "sg" as const };

type Sent = { url: string; headers: Record<string, string>; body: string; method: string };

/** A transport that records what goes on the wire and gives the canned answer. */
function transport(status: number, answer: unknown) {
  const sent: Sent[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: String(init?.body),
      method: init?.method ?? "GET",
    });
    return new Response(JSON.stringify(answer), { status });
  };
  return { sent, send: send as typeof fetch };
}

describe("nexconnCall", () => {
  it("posts the body as JSON to the data center of the region", async () => {
    const { sent, send } = transport(200, { code: 0, result: { accessToken: "token-1" } });

    const result = await nexconnCall("/v4/auth/access-token/issue", { userId: "u1", name: "Anita" }, { ...keys, region: "na" }, send);

    expect(result).toEqual({ accessToken: "token-1" });
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url).toBe("https://api.us-light-api.com/v4/auth/access-token/issue");
    expect(sent[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(sent[0].body)).toEqual({ userId: "u1", name: "Anita" });
  });

  it("signs each request with the secret, a fresh nonce and the time in milliseconds", async () => {
    const { sent, send } = transport(200, { code: 0 });
    const before = Date.now();

    await nexconnCall("/v4/group-channel/join", {}, keys, send);
    await nexconnCall("/v4/group-channel/join", {}, keys, send);

    for (const request of sent) {
      const { nonce, timestamp, signature } = request.headers;
      expect(request.headers["app-key"]).toBe("abc123def456");
      expect(nonce).toMatch(/^\d{1,18}$/);
      expect(Number(timestamp)).toBeGreaterThanOrEqual(before);
      expect(Number(timestamp)).toBeLessThanOrEqual(Date.now());
      expect(signature).toBe(createHash("sha1").update(`s3cr3tValue9876543210${nonce}${timestamp}`).digest("hex"));
      expect(request.headers["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(sent[0].headers.nonce).not.toBe(sent[1].headers.nonce);
  });

  it("never puts the secret on the wire", async () => {
    const { sent, send } = transport(200, { code: 0 });

    await nexconnCall("/v4/group-channel/join", { channelId: "room" }, keys, send);

    expect(JSON.stringify(sent)).not.toContain("s3cr3tValue9876543210");
  });

  it("gives an empty result for an answer with no result", async () => {
    const { send } = transport(200, { code: 0 });

    expect(await nexconnCall("/v4/group-channel/create", {}, keys, send)).toEqual({});
  });

  it("throws with the path and the code of a refusal, and without the secret", async () => {
    const { send } = transport(200, { code: 1004, message: "signature error" });

    const failure = await nexconnCall("/v4/group-channel/create", {}, keys, send).catch((error) => error);

    expect(failure).toBeInstanceOf(NexconnError);
    expect(failure).toMatchObject({ path: "/v4/group-channel/create", code: 1004, status: 200 });
    expect(failure.message).not.toContain("s3cr3tValue9876543210");
  });

  it("throws for an answer that is not JSON", async () => {
    const send = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch;

    const failure = await nexconnCall("/v4/group-channel/create", {}, keys, send).catch((error) => error);

    expect(failure).toMatchObject({ code: null, status: 502 });
  });

  it("refuses to call when chat is switched off", async () => {
    const { sent, send } = transport(200, { code: 0 });

    await expect(nexconnCall("/v4/group-channel/create", {}, null, send)).rejects.toThrow("Chat is switched off");
    expect(sent).toHaveLength(0);
  });
});
