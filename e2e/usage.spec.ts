import { expect, test } from "@playwright/test";
import { createRoom } from "./room-steps";

test("the usage page shows the counts by kind of room, with demo rooms apart", async ({ page }) => {
  const before = (await (await page.request.get("/api/usage")).json()).usage;
  await createRoom(page, "Office exchange 2026", "Anita");

  await page.goto("/usage");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Usage");
  const tonight = page.getByRole("row", { name: /Tonight rounds/ });
  await expect(tonight.getByRole("cell").first()).toHaveText(String(before.tonight.rooms + 1));
  await expect(page.getByRole("row", { name: /December rooms/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Demo rooms" }).getByRole("row", { name: /Demo rooms/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Groups that drew names" })).toContainText(String(before.tonight.draws + before.december.draws));

  // Counts only: the page and the answer of the server hold no name and no room code.
  const answer = JSON.stringify((await (await page.request.get("/api/usage")).json()).usage);
  expect(answer).toMatch(/^[a-z":{},0-9]+$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/usage-phone.png", fullPage: true });

  await page.getByRole("link", { name: "Solstice home" }).click();
  await expect(page.getByRole("link", { name: "Usage numbers" })).toBeVisible();
});
