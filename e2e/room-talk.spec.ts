/**
 * Room talk on the real Nexconn app. It runs only with `npm run test:e2e:talk`.
 * The two people and the room have fixed ids, so a run adds no new identity to the chat service.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { hashReturnSecret, IDENTITY_COOKIE, signIdentity } from "../lib/identity";
import { nexconnCall } from "../lib/nexconn-server";
import { E2E_SESSION_SECRET } from "../playwright.config";
import { TEST_DATABASE_URL } from "../tests/helpers/test-database";

const ROOM = "TALKE2E1";
const ANITA = `p${"0".repeat(20)}e2ea`;
const ROHAN = `p${"0".repeat(20)}e2eb`;

async function openAs(browser: Browser, personId: string, problems: string[]): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: IDENTITY_COOKIE, value: signIdentity(personId, E2E_SESSION_SECRET), url: "http://localhost:3412" }]);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
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
  await db.query("insert into people (id, return_hash) values ($1, $2), ($3, $4)", [ANITA, hashReturnSecret("e2e-anita"), ROHAN, hashReturnSecret("e2e-rohan")]);
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

  await rohan.reload();
  await expect(messages(rohan).filter({ hasText: `Hello team, ${run}` })).toContainText("Anita", { timeout: 30_000 });
  await expect(messages(rohan).filter({ hasText: `Hi Anita, ${run}` })).toContainText("You");
  await expect(messages(rohan).filter({ hasText: run })).toHaveCount(2);

  await rohan.setViewportSize({ width: 390, height: 844 });
  await rohan.screenshot({ path: "test-results/room-talk-phone.png", fullPage: true });
  expect(problems).toEqual([]);
  for (const page of [anita, rohan]) await page.context().close();
});
