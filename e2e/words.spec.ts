import { expect, test } from "@playwright/test";
import { createRoom } from "./room-steps";

test("the create form refuses a room name with a listed word, and says so at the field", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Room name").fill("Shit office");
  await page.getByLabel("Your display name").fill("Anita");
  await page.getByRole("button", { name: "Create room" }).click();

  await expect(page.getByText("Use kinder words.")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("a person cannot join with a name that the website uses for itself", async ({ page, browser }) => {
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const joiner = await (await browser.newContext()).newPage();
  await joiner.goto(invite);

  await joiner.getByLabel("Your display name").fill("Your Secret Giver");
  await joiner.getByRole("button", { name: "Join room" }).click();
  await expect(joiner.getByText("The website uses this name. Pick another one.")).toBeVisible();

  await joiner.getByLabel("Your display name").fill("Rohan");
  await joiner.getByRole("button", { name: "Join room" }).click();
  await expect(joiner.getByRole("listitem").filter({ hasText: "Rohan" })).toContainText("you");
  await joiner.context().close();
});
