/**
 * Smoke test of the browser SDK on the real Nexconn app. It runs only with NEXCONN_SMOKE=1: `npm run test:smoke`.
 * Two browsers connect as the two fixed test users. A third fixed user id is the sender on the server side.
 * The report lines show with `-- --silent=false`.
 */
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readConfig } from "@/lib/config";
import { nexconnCall, NexconnError } from "@/lib/nexconn-server";

const USER_A = "solsticeSmokeA";
const USER_B = "solsticeSmokeB";
const SYSTEM = "solsticeSmokeSystem";
const CHANNEL = "solsticeSmokeLive";
const SIGNAL = "Solstice:Signal";

const HARNESS = `<!doctype html><meta charset="utf-8"><title>SDK harness</title>
<script type="importmap">{"imports":{"@nexconn/chat":"/chat.js","@nexconn/engine":"/engine.js"}}</script>
<script type="module">
import { NCEngine, MessageHandler, ConnectionStatusHandler, GroupChannel, SendTextMessageParams } from "@nexconn/chat";
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
window.received = [];
window.statuses = [];
window.start = async (appKey, token) => {
  NCEngine.initialize({ appKey });
  NCEngine.registerCustomMessages([{ messageType: "${SIGNAL}", isPersisted: false, isCounted: false }]);
  NCEngine.addMessageHandler("smoke", new MessageHandler({
    onMessageReceived({ messages }) {
      for (const message of messages) window.received.push({ type: message.messageType, sender: message.senderUserId, content: plain(message.content) });
    },
  }));
  NCEngine.addConnectionStatusHandler("smoke", new ConnectionStatusHandler({
    onConnectionStatusChanged(event) { window.statuses.push({ status: event.status, code: event.code ?? null }); },
  }));
  return plain(await NCEngine.connect({ token }));
};
window.connectionStatus = () => NCEngine.getConnectionStatus();
window.sendText = async (channelId, text) => { const sent = await new GroupChannel(channelId).sendMessage(new SendTextMessageParams({ text })); return { isOk: sent.isOk, code: sent.code }; };
window.reconnect = async (token) => { await NCEngine.disconnect(); return plain(await NCEngine.connect({ token })); };
window.ready = true;
</script>`;

type Received = { type: string; sender: string; content: unknown };
type Harness = { start(appKey: string, token: string): Promise<unknown>; reconnect(token: string): Promise<unknown>; connectionStatus(): number; sendText(channelId: string, text: string): Promise<{ isOk: boolean; code: number }>; received: Received[] };

const FILES: Record<string, string> = {
  "/chat.js": "node_modules/@nexconn/chat/index.esm.js",
  "/engine.js": "node_modules/@nexconn/engine/index.esm.js",
};

async function issueToken(userId: string): Promise<string> {
  return (await nexconnCall<{ accessToken: string }>("/v4/auth/access-token/issue", { userId, name: userId })).accessToken;
}

async function sendToChannel(messageType: string, content: object, toUserIds?: string[]): Promise<void> {
  await nexconnCall("/v4/group-channel/message/send", {
    fromUserId: SYSTEM,
    toChannelIds: [CHANNEL],
    ...(toUserIds ? { toUserIds, shouldPersist: 0, disablePush: true } : {}),
    messageType,
    content: JSON.stringify(content),
  });
}

/** Waits until the page received a message of the type with the marker in its content. Returns the wait in milliseconds. */
async function waitFor(page: Page, type: string, marker: string): Promise<number> {
  const started = Date.now();
  await page.waitForFunction(
    ([wantedType, wantedMarker]) =>
      (window as unknown as Harness).received.some((message) => message.type === wantedType && JSON.stringify(message.content).includes(wantedMarker)),
    [type, marker],
    { timeout: 15_000 },
  );
  return Date.now() - started;
}

const receivedOf = (page: Page) => page.evaluate(() => (window as unknown as Harness).received);

describe.skipIf(process.env.NEXCONN_SMOKE !== "1")("the browser SDK on the real Nexconn app", () => {
  let server: Server;
  let browser: Browser;
  const hosts = new Set<string>();
  const pages: Record<string, Page> = {};
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const file = FILES[request.url ?? ""];
      response.setHeader("content-type", file ? "text/javascript" : "text/html");
      response.end(file ? await readFile(file) : HARNESS);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const userId of [USER_A, USER_B, SYSTEM]) tokens[userId] = await issueToken(userId);
    await nexconnCall("/v4/group-channel/create", { channelId: CHANNEL, name: "Smoke live", owner: SYSTEM, userIds: [USER_A, USER_B] }).catch((error) => {
      if (!(error instanceof NexconnError)) throw error;
    });

    browser = await chromium.launch();
    for (const userId of [USER_A, USER_B]) {
      const page = await (await browser.newContext()).newPage();
      page.on("request", (request) => hosts.add(`${new URL(request.url()).protocol}//${new URL(request.url()).host}`));
      page.on("websocket", (socket) => hosts.add(`${new URL(socket.url()).protocol}//${new URL(socket.url()).host}`));
      await page.goto(origin);
      await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
      const connected = await page.evaluate(([appKey, token]) => (window as unknown as Harness).start(appKey, token), [readConfig().nexconn!.appKey, tokens[userId]]);
      console.log(`connect ${userId}:`, JSON.stringify(connected).replace(/"token":"[^"]*"/g, '"token":"<hidden>"'));
      pages[userId] = page;
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    await nexconnCall("/v4/group-channel/dismiss", { channelId: CHANNEL }).catch(() => {});
    console.log("hosts the SDK talked to:", [...hosts].filter((host) => !host.includes("127.0.0.1")).sort().join(" "));
  });

  it("delivers a targeted signal to the named member only", async () => {
    // A new browser gets recent targeted messages again at connect, so each run marks its own signal.
    const run = `run-${Date.now()}`;
    await sendToChannel(SIGNAL, { kind: "state", run }, [USER_A]);
    const signalMs = await waitFor(pages[USER_A], SIGNAL, run);
    console.log("targeted signal reached the named member after ms:", signalMs);

    // The control message goes to every member after the signal. When B has it, B's silence on the signal is real.
    await sendToChannel("RC:TxtMsg", { content: "control-1" });
    await waitFor(pages[USER_A], "RC:TxtMsg", "control-1");
    await waitFor(pages[USER_B], "RC:TxtMsg", "control-1");

    const ofThisRun = (messages: Received[]) => messages.filter((message) => JSON.stringify(message.content).includes(run));
    expect(ofThisRun(await receivedOf(pages[USER_A]))).toEqual([{ type: SIGNAL, sender: SYSTEM, content: { kind: "state", run } }]);
    expect(ofThisRun(await receivedOf(pages[USER_B]))).toEqual([]);
  }, 60_000);

  // The word list of the website is in the chat service (see the server smoke test). A change of that
  // list takes about 15 minutes there, so this check fails for that long after a new word.
  it("drops a text message with a listed word in the chat service itself", async () => {
    const run = `run-${Date.now()}`;
    const sent = await pages[USER_A].evaluate(([channelId, words]) => (window as unknown as Harness).sendText(channelId, words), [CHANNEL, `this is shit ${run}`]);
    console.log("send of a listed word, as the sender sees it:", JSON.stringify(sent));

    // The control message goes out after it. When B has the control, the first message did not come.
    await sendToChannel("RC:TxtMsg", { content: `control-3 ${run}` });
    await waitFor(pages[USER_B], "RC:TxtMsg", `control-3 ${run}`);
    expect((await receivedOf(pages[USER_B])).filter((message) => JSON.stringify(message.content).includes(`shit ${run}`))).toEqual([]);
  }, 60_000);

  it("reports what token expiry does to a connected user", async () => {
    await nexconnCall("/v4/auth/access-token/expire", { userIds: [USER_B], expiresAt: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusAfter = await pages[USER_B].evaluate(() => (window as unknown as Harness).connectionStatus());
    await sendToChannel("RC:TxtMsg", { content: "control-2" });
    const stillReceives = await waitFor(pages[USER_B], "RC:TxtMsg", "control-2").then(() => true, () => false);
    const again = await pages[USER_B].evaluate((token) => (window as unknown as Harness).reconnect(token), tokens[USER_B]);
    console.log("after expiry: status", statusAfter, "| still receives:", stillReceives, "| reconnect with the old token:", JSON.stringify(again));

    // Seen on 20 November 2026, in runs minutes apart: one time the user stayed connected and the old token
    // still opened a new connection; one time the user was disconnected and the old token was refused (31004).
    // So expiry is no sure way to put a person out. Removal from the group channel is. No check on the result here.
    expect(typeof statusAfter).toBe("number");
  }, 60_000);
});
