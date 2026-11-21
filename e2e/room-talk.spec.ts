/**
 * Room talk and signals on the real Nexconn app. It runs only with `npm run test:e2e:talk`.
 * The three people have fixed ids, so a run adds no new identity to the chat service. The room is new
 * in each run: the chat service gives a connecting browser the recent messages of its channel again,
 * so a fixed room would show the cheers of the last run.
 */
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { hashReturnSecret, IDENTITY_COOKIE, signIdentity } from "../lib/identity";
import { nexconnCall } from "../lib/nexconn-server";
import { E2E_SESSION_SECRET } from "../playwright.config";
import { TEST_DATABASE_URL } from "../tests/helpers/test-database";

const ROOM = `T${Date.now().toString(36).toUpperCase()}`;
const ANITA = `p${"0".repeat(20)}e2ea`;
const ROHAN = `p${"0".repeat(20)}e2eb`;
const MEERA = `p${"0".repeat(20)}e2ec`;
/** Criterion 4 of the spec: at the reveal, a second browser shows the pair within 2 seconds of the server answer. */
const REVEAL_LIMIT_MS = 2000;
/** Other signals: well under the 10 second load of the room screen. Seen on the real app: 0.3 to 2.3 seconds. */
const SIGNAL_LIMIT_MS = 5000;

type Frame = { at: number; text: string };
/** Every frame that the chat service sent to a page, as text, with the time it came in. */
const framesOf = new WeakMap<Page, Frame[]>();

async function pageOf(browser: Browser, personId: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: IDENTITY_COOKIE, value: signIdentity(personId, E2E_SESSION_SECRET), url: "http://localhost:3412" }]);
  const page = await context.newPage();
  const frames: Frame[] = [];
  framesOf.set(page, frames);
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push({ at: Date.now(), text: Buffer.from(frame.payload).toString("latin1") })));
  return page;
}

async function openAs(browser: Browser, personId: string, problems: string[]): Promise<Page> {
  const page = await pageOf(browser, personId);
  page.on("console", (message) => {
    // The chat SDK tries to post a usage log (user id, device details) to this host. Our policy
    // blocks it, the browser reports the block, and room talk works without it.
    if (message.type() === "error" && !message.text().includes("https://logcollection.ronghub.com/")) problems.push(message.text());
  });
  await page.goto(`/r/${ROOM}`);
  await expect(page.getByLabel("Message to the room")).toBeVisible({ timeout: 30_000 });
  return page;
}

async function say(page: Page, words: string): Promise<void> {
  await page.getByLabel("Message to the room").fill(words);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Message to the room")).toHaveValue("");
}

const messages = (page: Page) => page.getByRole("log", { name: "Messages" }).getByRole("listitem");

test.beforeAll(async () => {
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  // A worker that starts again after a failure finds the people in place.
  await db.query("insert into people (id, return_hash) values ($1, $2), ($3, $4), ($5, $6) on conflict (id) do nothing", [
    ANITA, hashReturnSecret("e2e-anita"), ROHAN, hashReturnSecret("e2e-rohan"), MEERA, hashReturnSecret("e2e-meera"),
  ]);
  const room = await db.query("insert into rooms (code, name, kind, organizer_id) values ($1, 'Office exchange 2026', 'tonight', $2) returning id", [ROOM, ANITA]);
  await db.query("insert into members (room_id, person_id, display_name, role) values ($1, $2, 'Anita', 'member'), ($1, $3, 'Rohan', 'member')", [room.rows[0].id, ANITA, ROHAN]);
  await db.end();
});

test.afterAll(async () => {
  await nexconnCall("/v4/group-channel/dismiss", { channelId: ROOM }).catch(() => {});
});

test("two members talk in the room and see the history after a reload", async ({ browser }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const run = `run ${Date.now()}`;
  const anita = await openAs(browser, ANITA, problems);
  const rohan = await openAs(browser, ROHAN, problems);

  await say(anita, `Hello team, ${run}`);
  await expect(messages(rohan).filter({ hasText: `Hello team, ${run}` })).toContainText("Anita");
  await expect(messages(anita).filter({ hasText: `Hello team, ${run}` })).toContainText("You");

  await say(rohan, `Hi Anita, ${run}`);
  await expect(messages(anita).filter({ hasText: `Hi Anita, ${run}` })).toContainText("Rohan");

  // A listed word stops on the sender's own screen, with the reason, and reaches nobody.
  await anita.getByLabel("Message to the room").fill(`This is shit, ${run}`);
  await anita.getByRole("button", { name: "Send" }).click();
  await expect(anita.getByText("Use kinder words. This message was not sent.")).toBeVisible();
  await say(anita, `A kind message, ${run}`);
  await expect(messages(rohan).filter({ hasText: `A kind message, ${run}` })).toContainText("Anita");
  await expect(messages(rohan).filter({ hasText: "This is shit" })).toHaveCount(0);

  await rohan.reload();
  await expect(messages(rohan).filter({ hasText: `Hello team, ${run}` })).toContainText("Anita", { timeout: 30_000 });
  await expect(messages(rohan).filter({ hasText: `Hi Anita, ${run}` })).toContainText("You");
  await expect(messages(rohan).filter({ hasText: run })).toHaveCount(3);

  await rohan.setViewportSize({ width: 390, height: 844 });
  await rohan.screenshot({ path: "test-results/room-talk-phone.png", fullPage: true });
  expect(problems).toEqual([]);
  for (const page of [anita, rohan]) await page.context().close();
});

/**
 * Runs the action on one browser and returns how long after the server answer the target showed on
 * another browser. The wait ends before the 10 second load of the room screen can explain it.
 */
async function shownAfter(actor: Page, route: string, action: () => Promise<void>, target: Locator): Promise<number> {
  const seen = target.waitFor({ state: "visible", timeout: 9000 }).then(() => Date.now());
  const answered = actor.waitForResponse((response) => response.url().endsWith(route) && response.request().method() === "POST").then(() => Date.now());
  await action();
  return (await seen) - (await answered);
}

test("a join, the draw, a reveal step and a mask message reach another browser within 2 seconds", async ({ browser }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const anita = await openAs(browser, ANITA, problems);
  const rohan = await openAs(browser, ROHAN, problems);
  const meera = await pageOf(browser, MEERA);
  await meera.goto(`/r/${ROOM}`);
  await meera.getByLabel("Your display name").fill("Meera");

  const joinMs = await shownAfter(meera, "/members", () => meera.getByRole("button", { name: "Join room" }).click(), anita.getByRole("heading", { name: "In the room: 3" }));
  await expect(meera.getByLabel("Message to the room")).toBeVisible({ timeout: 30_000 });

  await anita.getByRole("button", { name: "Draw names" }).click();
  const drawMs = await shownAfter(anita, "/draw", () => anita.getByRole("button", { name: "Yes, draw" }).click(), rohan.locator(".drawcard__name"));

  const revealMs = await shownAfter(anita, "/reveal", () => anita.getByRole("button", { name: "Reveal next" }).click(), rohan.getByRole("heading", { name: "Pair 1 of 3" }));
  await expect(meera.getByRole("heading", { name: "Pair 1 of 3" })).toBeVisible({ timeout: REVEAL_LIMIT_MS + 1000 });

  // A mask message: the signal goes to the receiver only, and the receiver's thread shows the text.
  const receiverName = (await anita.locator(".drawcard .drawcard__name").textContent())!;
  const receiver = receiverName === "Rohan" ? rohan : meera;
  const third = receiverName === "Rohan" ? meera : rohan;
  await anita.getByLabel(`Message to ${receiverName}`).fill("What size do you wear?");
  const maskStart = Date.now();
  const maskMs = await shownAfter(
    anita,
    "/mask",
    () => anita.getByLabel(`Message to ${receiverName}`).press("Enter"),
    receiver.getByRole("log", { name: "Messages with your secret giver" }).getByText("What size do you wear?"),
  );

  console.log(`signal times in ms after the server answer: join ${joinMs}, draw ${drawMs}, reveal ${revealMs}, mask ${maskMs}`);
  expect(maskMs).toBeLessThanOrEqual(SIGNAL_LIMIT_MS);
  // What the chat service itself sent for the mask message: one signal to the receiver, with no
  // text of the message and no id of the giver in any frame; and no signal to the third member.
  const since = (page: Page) => framesOf.get(page)!.filter((frame) => frame.at >= maskStart);
  // The timed load can show the thread before the signal comes in, so wait for the signal frame itself.
  await expect.poll(() => since(receiver).some((frame) => frame.text.includes("Solstice:Signal")), { timeout: 8000 }).toBe(true);
  for (const frame of since(receiver)) {
    expect(frame.text).not.toContain(ANITA);
    expect(frame.text).not.toContain("What size do you wear?");
  }
  expect(since(third).some((frame) => frame.text.includes("Solstice:Signal"))).toBe(false);

  // Cheers at the reveal: a custom message from the browser. Each screen names who cheered this pair.
  const cheersOf = (page: Page) => page.getByRole("status").filter({ hasText: "Cheers from" });
  await expect(cheersOf(rohan)).toHaveCount(0);
  await rohan.getByRole("button", { name: "Send a cheer" }).click();
  await expect(cheersOf(rohan)).toHaveText("Cheers from you.");
  await expect(rohan.getByRole("button", { name: "Send a cheer" })).toHaveCount(0);
  await expect(cheersOf(anita)).toHaveText("Cheers from Rohan.", { timeout: SIGNAL_LIMIT_MS });
  await expect(cheersOf(meera)).toHaveText("Cheers from Rohan.", { timeout: SIGNAL_LIMIT_MS });
  await anita.getByRole("button", { name: "Send a cheer" }).click();
  await expect(cheersOf(rohan)).toHaveText("Cheers from Anita and you.", { timeout: SIGNAL_LIMIT_MS });
  await expect(cheersOf(anita)).toHaveText("Cheers from Rohan and you.");
  await rohan.setViewportSize({ width: 390, height: 844 });
  await rohan.locator("section").filter({ has: rohan.getByRole("heading", { name: "Pair 1 of 3" }) }).screenshot({ path: "test-results/cheers-phone.png" });
  expect(joinMs).toBeLessThanOrEqual(SIGNAL_LIMIT_MS);
  expect(drawMs).toBeLessThanOrEqual(SIGNAL_LIMIT_MS);
  expect(revealMs).toBeLessThanOrEqual(REVEAL_LIMIT_MS);
  expect(problems).toEqual([]);
  for (const page of [anita, rohan, meera]) await page.context().close();
});
