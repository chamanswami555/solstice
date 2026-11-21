import { expect, test } from "@playwright/test";
import { createRoom, drawNames, join } from "./room-steps";

const NUDGE_TEXT = "Someone has a secret question waiting";

test("a member nudges the group after the draw, with a text that names nobody", async ({ page, browser }) => {
  test.setTimeout(120_000);
  // The phone's share sheet, replaced by a recorder: the test reads what the page handed to it.
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { sharedForTest: shared });
    Object.defineProperty(navigator, "share", { value: async (data: ShareData) => void shared.push(data), configurable: true });
  });
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  await expect(page.getByRole("button", { name: "Nudge the group" })).toHaveCount(0);
  const rohan = await join(browser, invite, "Rohan");
  await join(browser, invite, "Meera");
  await join(browser, invite, "Kabir");
  await drawNames(page, 4);

  await page.getByRole("button", { name: "Nudge the group" }).click();
  const shared = await page.evaluate(() => (window as unknown as { sharedForTest: ShareData[] }).sharedForTest);
  expect(shared).toEqual([{ text: NUDGE_TEXT, url: invite }]);
  for (const name of ["Anita", "Rohan", "Meera", "Kabir"]) expect(JSON.stringify(shared)).not.toContain(name);
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("section").filter({ has: page.getByRole("button", { name: "Nudge the group" }) }).screenshot({ path: "test-results/nudge-phone.png" });

  // A browser with no share sheet copies the same text and link instead.
  await rohan.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await rohan.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await rohan.getByRole("button", { name: "Nudge the group" }).click();
  await expect(rohan.getByRole("status").filter({ hasText: "Copied. Paste it in your group chat." })).toBeVisible();
  expect(await rohan.evaluate(() => navigator.clipboard.readText())).toBe(`${NUDGE_TEXT}: ${invite}`);

  // A guest who joins after the draw has no thread, so no nudge.
  const dev = await join(browser, invite, "Dev");
  await expect(dev.getByRole("heading", { name: "In the room: 5" })).toBeVisible();
  await expect(dev.getByRole("button", { name: "Nudge the group" })).toHaveCount(0);
});

test("the demo room has no group to nudge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo room" }).click();
  await page.getByRole("button", { name: "Draw names" }).click();
  await page.getByRole("button", { name: "Yes, draw" }).click();
  await expect(page.locator(".drawcard__name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nudge the group" })).toHaveCount(0);
});
