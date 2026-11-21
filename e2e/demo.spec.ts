import { expect, test } from "@playwright/test";
import { roomApi } from "./room-steps";

const DEMO_NAMES = ["Asha", "Vikram", "Neha"];
/** Criterion 5 of the spec: a visitor alone finishes the demo room in 3 minutes or less. */
const DEMO_LIMIT_MS = 180_000;

test("a visitor alone goes from the first screen to the ring in a demo room", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  const started = Date.now();
  await page.getByRole("button", { name: "Try the demo room" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo room");
  await expect(page.getByRole("heading", { name: "This is a demo room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "In the room: 4" })).toBeVisible();
  for (const name of DEMO_NAMES) await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("demo");
  await expect(page.getByRole("listitem").filter({ hasText: "Visitor" })).toContainText("organizer, you");
  await expect(page.getByRole("heading", { name: "Invite your group" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/demo-start-phone.png", fullPage: true });

  // The draw: the visitor gives to a demo member and sees that member's wishes.
  await page.getByRole("button", { name: "Draw names" }).click();
  await page.getByRole("button", { name: "Yes, draw" }).click();
  const receiver = (await page.locator(".drawcard .drawcard__name").textContent())!;
  expect(DEMO_NAMES).toContain(receiver);
  await expect(page.getByText(`Wish list of ${receiver}:`)).toBeVisible();

  // Secret talk: the demo member answers at once, and the secret giver has asked a question.
  await page.getByLabel(`Message to ${receiver}`).fill("What size do you wear?");
  await page.getByLabel(`Message to ${receiver}`).press("Enter");
  await expect(page.getByRole("log", { name: `Messages with ${receiver}` }).getByText("Demo answer: thank you for asking.")).toBeVisible();
  await expect(page.getByRole("log", { name: "Messages with your secret giver" }).getByText("Demo question from your secret giver: tea or coffee?")).toBeVisible();
  // The visitor answers the secret giver, and the demo giver answers back. The visitor's line is "You".
  await page.getByLabel("Message to your secret giver").fill("Tea, please.");
  await page.getByLabel("Message to your secret giver").press("Enter");
  const giverThread = page.getByRole("log", { name: "Messages with your secret giver" }).getByRole("listitem");
  await expect(giverThread.filter({ hasText: "Demo answer from your secret giver" })).toBeVisible();
  await expect(giverThread.filter({ hasText: "Tea, please." })).toContainText("You");
  // A second question to the receiver gets the next line of the script.
  await page.getByLabel(`Message to ${receiver}`).fill("Any colour?");
  await page.getByLabel(`Message to ${receiver}`).press("Enter");
  await expect(page.getByRole("log", { name: `Messages with ${receiver}` }).getByText("Demo answer: blue or green.")).toBeVisible();

  // The gift note, then the reveal of all four pairs.
  await page.getByRole("textbox", { name: "Gift note", exact: true }).fill("A song for you.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Gift notes in: 4 of 4.")).toBeVisible();
  for (const step of [1, 2, 3]) {
    await page.getByRole("button", { name: "Reveal next" }).click();
    await expect(page.getByRole("heading", { name: `Pair ${step} of 4` })).toBeVisible();
    await expect(page.locator(".reveal__note")).not.toHaveText("No note yet");
  }
  await page.getByRole("button", { name: "Reveal next" }).click();
  await expect(page.getByRole("heading", { name: "The ring" })).toBeVisible();
  const tookMs = Date.now() - started;
  await expect(page.getByRole("listitem").filter({ hasText: "gave to" })).toHaveCount(4);
  await expect(page.getByRole("listitem").filter({ hasText: "Visitorgave to" })).toContainText("A song for you.");
  // After the reveal the mask is off: the thread names the giver, who is a demo member.
  await expect(page.getByRole("heading", { name: /Your talk with (Asha|Vikram|Neha)/ })).toHaveCount(2);
  console.log(`demo room, first click to the ring: ${tookMs} ms`);
  expect(tookMs).toBeLessThanOrEqual(DEMO_LIMIT_MS);
  await page.screenshot({ path: "test-results/demo-ring-phone.png", fullPage: true });

  // A new start gives a fresh room, and the old one is gone.
  const oldState = roomApi(page, "state");
  await page.getByRole("button", { name: "Start the demo again" }).click();
  await expect(page.getByRole("button", { name: "Draw names" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The ring" })).toHaveCount(0);
  expect(roomApi(page, "state")).not.toBe(oldState);
  expect((await page.request.get(oldState)).status()).toBe(404);
});

test("a second person cannot join a demo room", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo room");

  const other = await (await browser.newContext()).newPage();
  await other.goto(page.url());
  await other.getByLabel("Your display name").fill("Rohan");
  await other.getByRole("button", { name: "Join room" }).click();

  await expect(other.getByText("A demo room is for one visitor. Create a room for your group.")).toBeVisible();
  await other.context().close();
});
