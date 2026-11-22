import { expect, test, type Page } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

const shownPair = (page: Page) => page.locator(".reveal__pair");

test("four people and a guest watch the reveal pair by pair and end on the ring", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const members = [await join(browser, invite, "Rohan"), await join(browser, invite, "Meera"), await join(browser, invite, "Kabir")];
  await drawNames(page, 4);
  const guest = await join(browser, invite, "Sana");
  const everyone = [page, ...members, guest];

  // Before the first tap no screen and no state names a pair, and only the organizer has the button.
  for (const person of everyone) {
    const state = await (await person.request.get(roomApi(person, "state"))).json();
    expect(state.reveal).toEqual({ step: 0, total: 4, pairs: [] });
  }
  await expect(members[0].getByText("The organizer has not started the reveal yet.")).toBeVisible(SLOW);
  await expect(members[0].getByRole("button", { name: "Reveal next" })).toHaveCount(0);
  const forbidden = await members[0].request.post(roomApi(members[0], "reveal"), { data: { step: 0 } });
  expect(forbidden.status()).toBe(403);
  const badBody = await page.request.post(roomApi(page, "reveal"), { data: {} });
  expect(badBody.status()).toBe(422);

  await page.getByRole("button", { name: "Reveal next" }).click();
  await expect(page.getByRole("heading", { name: "Pair 1 of 4" })).toBeVisible();
  // Cheers travel through room talk. With room talk switched off, no cheer is offered.
  await expect(page.getByRole("button", { name: "Send a cheer" })).toHaveCount(0);
  const firstPair = await shownPair(page).innerText();
  for (const person of everyone) {
    await expect(person.getByRole("heading", { name: "Pair 1 of 4" })).toBeVisible(SLOW);
    expect(await shownPair(person).innerText()).toBe(firstPair);
  }
  await expect(shownPair(page)).toContainText("The secret giver of");
  // The giver's name rises after a pause, and stands still for a person who asks for less motion.
  const motion = () => page.locator(".reveal__giver").evaluate((name) => getComputedStyle(name).animationName);
  expect(await motion()).toBe("reveal-rise");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await motion()).toBe("none");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Pair 1 of 4" }) }).screenshot({ path: "test-results/reveal-stage-phone.png" });
  await page.emulateMedia({ reducedMotion: null });
  await members[1].setViewportSize({ width: 390, height: 844 });
  await members[1].screenshot({ path: "test-results/reveal-pair-phone.png", fullPage: true });

  // A member who scrolled down is brought back to the reveal by the next pair.
  await members[1].evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(members[1].locator(".reveal__pair")).not.toBeInViewport();
  for (const step of [2, 3]) {
    await page.getByRole("button", { name: "Reveal next" }).click();
    await expect(page.getByRole("heading", { name: `Pair ${step} of 4` })).toBeVisible();
    // The motion plays again for each pair: its clock is still inside the 1.8 seconds of the giver's rise.
    expect(await page.locator(".reveal__giver").evaluate((name) => Number(name.getAnimations()[0]?.currentTime ?? 1e9))).toBeLessThan(1800);
  }
  await expect(members[1].getByRole("heading", { name: "Pair 3 of 4" })).toBeVisible(SLOW);
  await expect(members[1].locator(".reveal__pair")).toBeInViewport();
  await expect(page.getByRole("list", { name: "Pairs shown before" }).getByRole("listitem")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/reveal-organizer-phone.png", fullPage: true });
  await page.getByRole("button", { name: "Reveal next" }).click();

  for (const person of everyone) {
    await expect(person.getByRole("heading", { name: "The ring" })).toBeVisible(SLOW);
    await expect(person.getByRole("listitem").filter({ hasText: "gave to" })).toHaveCount(4);
    await expect(person.getByRole("link", { name: "Start your December room" })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Reveal next" })).toHaveCount(0);
  await expect(members[0].getByText("Keep it to yourself until the reveal.")).toHaveCount(0);
  await members[1].screenshot({ path: "test-results/reveal-ring-phone.png", fullPage: true });
  for (const person of [...members, guest]) await person.context().close();
});

test("a December room before its date asks the organizer to confirm the reveal", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  const exchangeDate = `${inThirtyDays.getFullYear()}-${pad(inThirtyDays.getMonth() + 1)}-${pad(inThirtyDays.getDate())}`;
  const invite = await createRoom(page, "Family exchange", "Anita", exchangeDate);
  const members = [await join(browser, invite, "Rohan"), await join(browser, invite, "Meera")];
  await drawNames(page, 3);

  await page.getByRole("button", { name: "Reveal next" }).click();
  await expect(page.getByText(`The exchange is on ${exchangeDate}. Reveal the pairs now?`)).toBeVisible();
  await page.getByRole("button", { name: "Not yet" }).click();
  expect((await (await page.request.get(roomApi(page, "state"))).json()).reveal.step).toBe(0);

  await page.getByRole("button", { name: "Reveal next" }).click();
  await page.getByRole("button", { name: "Yes, reveal now" }).click();
  await expect(page.getByRole("heading", { name: "Pair 1 of 3" })).toBeVisible();
  // From the second pair on there is no question.
  await page.getByRole("button", { name: "Reveal next" }).click();
  await expect(page.getByRole("heading", { name: "Pair 2 of 3" })).toBeVisible();
  for (const person of members) await person.context().close();
});

test("the reveal route refuses a caller with no identity", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });

  const response = await anonymous.post("/api/rooms/ZZZZZZZZ/reveal", { data: { step: 0 } });

  expect(response.status()).toBe(401);
  await anonymous.dispose();
});
