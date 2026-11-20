import { expect, test } from "@playwright/test";
import { createRoom } from "./room-steps";

test("a room works with room talk switched off, and says so", async ({ page }) => {
  await createRoom(page, "Office exchange 2026", "Anita");

  await expect(page.getByText("Room talk is not available now. The draw and the reveal work without it.")).toBeVisible();
  await expect(page.getByLabel("Message to the room")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The draw" })).toBeVisible();
  const token = await page.request.post(page.url().replace("/r/", "/api/rooms/") + "/token", { data: {} });
  expect(token.status()).toBe(503);
  expect((await token.json()).error.code).toBe("CHAT_OFF");
});

test("the token route refuses a caller with no identity", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });

  const response = await anonymous.post("/api/rooms/ZZZZZZZZ/token", { data: {} });

  expect(response.status()).toBe(401);
  await anonymous.dispose();
});
