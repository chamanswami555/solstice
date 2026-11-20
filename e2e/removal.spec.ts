import { expect, test } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

test("the organizer removes a member before the draw, and that person cannot come back", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const rohan = await join(browser, invite, "Rohan");
  const meera = await join(browser, invite, "Meera");
  const kabir = await join(browser, invite, "Kabir");
  await expect(page.getByRole("heading", { name: "In the room: 4" })).toBeVisible(SLOW);

  // Only the organizer has the buttons, and none for the organizer's own row.
  await expect(rohan.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(3);
  const forbidden = await rohan.request.delete(roomApi(rohan, "members/Meera"), { data: {} });
  expect(forbidden.status()).toBe(403);

  // A question first. "Keep" changes nothing.
  await page.getByRole("button", { name: "Remove Rohan" }).click();
  await expect(page.getByText("Remove Rohan? This person cannot join the room again.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/removal-phone.png", fullPage: true });
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByRole("heading", { name: "In the room: 4" })).toBeVisible();

  await page.getByRole("button", { name: "Remove Rohan" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByRole("heading", { name: "In the room: 3" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Rohan" })).toHaveCount(0);

  // The removed person is outside: no state, and the join form refuses with the reason.
  await expect(rohan.getByRole("button", { name: "Join room" })).toBeVisible(SLOW);
  expect((await rohan.request.get(roomApi(rohan, "state"))).status()).toBe(404);
  await rohan.getByLabel("Your display name").fill("Rohan");
  await rohan.getByRole("button", { name: "Join room" }).click();
  await expect(rohan.getByText("The organizer removed you from this room.")).toBeVisible();

  // After the draw nobody can be removed, on the screen and on the server.
  await drawNames(page, 3);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  const late = await page.request.delete(roomApi(page, "members/Meera"), { data: {} });
  expect(late.status()).toBe(409);
  expect((await late.json()).error.code).toBe("ALREADY_DRAWN");
  await expect(meera.locator(".drawcard .drawcard__name")).toBeVisible(SLOW);
  for (const person of [rohan, meera, kabir]) await person.context().close();
});

test("the removal route refuses a caller with no identity", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });

  expect((await anonymous.delete("/api/rooms/ZZZZZZZZ/members/Rohan", { data: {} })).status()).toBe(401);
  await anonymous.dispose();
});
