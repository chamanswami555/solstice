import { expect, test, type Page } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

const maskOf = async (page: Page) => (await page.request.get(roomApi(page, "mask"))).json();
const thread = (page: Page, withWhom: string) => page.getByRole("log", { name: `Messages with ${withWhom}` }).getByRole("listitem");

async function say(page: Page, to: string, words: string): Promise<void> {
  await page.getByLabel(`Message to ${to}`).fill(words);
  await page.getByLabel(`Message to ${to}`).press("Enter");
}

test("a giver and a receiver talk through the mask, and the receiver cannot see who the giver is", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const pages: Record<string, Page> = { Anita: page };
  for (const name of ["Rohan", "Meera", "Kabir"]) pages[name] = await join(browser, invite, name);
  await drawNames(page, 4);

  const receiverName = (await page.locator(".drawcard__name").textContent())!;
  const receiver = pages[receiverName];
  const third = Object.entries(pages).find(([name]) => name !== "Anita" && name !== receiverName)![1];

  // Anita, the giver, asks a question. On her screen the thread has the receiver's name.
  await expect(page.getByRole("heading", { name: `Your talk with ${receiverName}` })).toBeVisible(SLOW);
  await say(page, receiverName, "What size do you wear?");
  await expect(thread(page, receiverName).filter({ hasText: "What size do you wear?" })).toContainText("You");

  // The receiver gets it from "Your secret giver". Nothing in the answer of the server names Anita.
  await expect(thread(receiver, "your secret giver").filter({ hasText: "What size do you wear?" })).toContainText("Your secret giver", SLOW);
  const seen = await maskOf(receiver);
  expect(seen.threads.receiving.withName).toBeNull();
  expect(JSON.stringify(seen.threads.receiving)).not.toContain("Anita");
  expect(JSON.stringify(await maskOf(third))).not.toContain("What size do you wear?");
  await receiver.setViewportSize({ width: 390, height: 844 });
  await receiver.screenshot({ path: "test-results/mask-receiver-phone.png", fullPage: true });

  // The answer goes back to the giver.
  await say(receiver, "your secret giver", "Medium.");
  await expect(thread(page, receiverName).filter({ hasText: "Medium." })).toContainText(receiverName, SLOW);

  // A word from the word list is refused, and says why.
  await say(page, receiverName, "You bastard");
  await expect(page.getByText("Use kinder words. This message was not sent.")).toBeVisible();
  await expect(thread(page, receiverName)).toHaveCount(2);

  // The receiver mutes the thread. The giver sees it and the server refuses a message.
  await receiver.getByRole("region", { name: "Your talk with your secret giver" }).getByRole("button", { name: "Mute this thread" }).click();
  await expect(receiver.getByText("This thread is muted.")).toBeVisible();
  await expect(page.getByText("This thread is muted. The other person muted it.")).toBeVisible(SLOW);
  const refused = await page.request.post(roomApi(page, "mask"), { data: { side: "giving", text: "Hello?" } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error.message).toBe("This thread is muted.");
  const notMine = await page.request.put(roomApi(page, "mask/mute"), { data: { side: "giving", muted: false } });
  expect(notMine.status()).toBe(403);

  await receiver.getByRole("button", { name: "Open this thread again" }).click();
  await expect(page.getByLabel(`Message to ${receiverName}`)).toBeVisible(SLOW);
  await say(page, receiverName, "Thank you!");
  await expect(thread(receiver, "your secret giver").filter({ hasText: "Thank you!" })).toBeVisible(SLOW);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mask-giver-phone.png", fullPage: true });
  for (const name of ["Rohan", "Meera", "Kabir"]) await pages[name].context().close();
});

test("the mask routes refuse a caller with no identity, and a guest has no thread", async ({ page, browser, playwright }) => {
  test.setTimeout(90_000);
  const invite = await createRoom(page, "Small team", "Anita");
  const members = [await join(browser, invite, "Rohan"), await join(browser, invite, "Meera")];
  await expect(page.getByRole("heading", { name: /Your talk with/ })).toHaveCount(0);
  await drawNames(page, 3);
  const guest = await join(browser, invite, "Sana");

  await expect(guest.getByText("You joined after the draw, so you are a guest.")).toBeVisible();
  await expect(guest.getByRole("heading", { name: /Your talk with/ })).toHaveCount(0);
  expect((await maskOf(guest)).threads).toEqual({ giving: null, receiving: null });
  const noThread = await guest.request.post(roomApi(guest, "mask"), { data: { side: "giving", text: "Hello" } });
  expect(noThread.status()).toBe(404);

  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });
  expect((await anonymous.get("/api/rooms/ZZZZZZZZ/mask")).status()).toBe(401);
  expect((await anonymous.post("/api/rooms/ZZZZZZZZ/mask", { data: { side: "giving", text: "Hi" } })).status()).toBe(401);
  expect((await anonymous.put("/api/rooms/ZZZZZZZZ/mask/mute", { data: { side: "giving", muted: true } })).status()).toBe(401);
  await anonymous.dispose();
  for (const person of [...members, guest]) await person.context().close();
});
