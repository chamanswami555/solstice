import { expect, test, type Page } from "@playwright/test";
import { createRoom, join, SLOW } from "./room-steps";

const receiverOf = (page: Page) => page.locator(".drawcard__name");

test("four people draw names and each one sees only their own receiver", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const joiners = [await join(browser, invite, "Rohan"), await join(browser, invite, "Meera"), await join(browser, invite, "Kabir")];
  const everyone: [string, Page][] = [["Anita", page], ["Rohan", joiners[0]], ["Meera", joiners[1]], ["Kabir", joiners[2]]];

  await expect(joiners[0].getByRole("button", { name: "Draw names" })).toHaveCount(0);
  await expect(joiners[0].getByText("The organizer has not drawn the names yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "In the room: 4" })).toBeVisible(SLOW);
  await page.getByRole("button", { name: "Draw names" }).click();
  await expect(page.getByText("Draw now for 4 members? You cannot draw again.")).toBeVisible();
  await page.getByRole("button", { name: "Yes, draw" }).click();

  const receivers: string[] = [];
  for (const [name, person] of everyone) {
    await expect(receiverOf(person)).toBeVisible(SLOW);
    const receiver = (await receiverOf(person).textContent())!;
    expect(receiver).not.toBe(name);
    receivers.push(receiver);
  }
  expect([...receivers].sort()).toEqual(["Anita", "Kabir", "Meera", "Rohan"]);

  // The draw card is still there after a reload, and the state of one member names no other pair.
  await joiners[0].reload();
  await expect(receiverOf(joiners[0])).toHaveText(receivers[1], SLOW);
  const state = await joiners[0].request.get(joiners[0].url().replace("/r/", "/api/rooms/") + "/state");
  expect((await state.json()).draw).toEqual({ drawn: true, receiverName: receivers[1] });

  // A member who is not the organizer cannot draw, and a late person joins as a guest.
  const forbidden = await joiners[0].request.post(joiners[0].url().replace("/r/", "/api/rooms/") + "/draw", { data: {} });
  expect(forbidden.status()).toBe(403);
  const late = await join(browser, invite, "Sana");
  await expect(late.getByText("You joined after the draw, so you are a guest.")).toBeVisible();
  await expect(late.getByRole("listitem").filter({ hasText: "Sana" })).toContainText("guest, you");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/draw-phone.png", fullPage: true });
  for (const person of [...joiners, late]) await person.context().close();
});

test("with three members the organizer sees the notice about a fourth", async ({ page, browser }) => {
  const invite = await createRoom(page, "Small team", "Anita");
  await expect(page.getByText("A draw needs 3 or more members.")).toBeVisible();
  const joiners = [await join(browser, invite, "Rohan"), await join(browser, invite, "Meera")];

  await expect(page.getByText("With 3 people you can work out your giver. Invite a 4th.")).toBeVisible(SLOW);
  await expect(page.getByRole("button", { name: "Draw names" })).toBeVisible();
  for (const person of joiners) await person.context().close();
});

test("the draw route refuses a caller with no identity", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });

  const response = await anonymous.post("/api/rooms/ZZZZZZZZ/draw", { data: {} });

  expect(response.status()).toBe(401);
  await anonymous.dispose();
});
