import { expect, test, type Page } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

const stateOf = async (page: Page) => (await page.request.get(roomApi(page, "state"))).json();

test("givers write gift notes in a tonight round and the reveal shows them", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const pages: Record<string, Page> = { Anita: page, Rohan: await join(browser, invite, "Rohan"), Meera: await join(browser, invite, "Meera") };
  await expect(page.getByRole("heading", { name: /Your gift note for/ })).toHaveCount(0);
  await drawNames(page, 3);

  const receiverOf: Record<string, string> = {};
  for (const [name, person] of Object.entries(pages)) receiverOf[name] = (await person.locator(".drawcard .drawcard__name").textContent(SLOW))!;

  // Rohan writes a note and Meera writes a link. Anita writes nothing.
  const rohan = pages.Rohan;
  await expect(rohan.getByRole("heading", { name: `Your gift note for ${receiverOf.Rohan}` })).toBeVisible();
  await rohan.getByRole("textbox", { name: "Gift note", exact: true }).fill("Coffee is on me tomorrow.");
  await rohan.getByRole("button", { name: "Save note" }).click();
  await expect(rohan.getByRole("status").filter({ hasText: /^Saved\.$/ })).toBeVisible();
  await pages.Meera.getByRole("textbox", { name: "Gift note", exact: true }).fill("https://example.com/a-song-for-you");
  await pages.Meera.getByRole("button", { name: "Save note" }).click();
  await expect(pages.Meera.getByRole("status").filter({ hasText: /^Saved\.$/ })).toBeVisible();
  await rohan.setViewportSize({ width: 390, height: 844 });
  await rohan.screenshot({ path: "test-results/note-phone.png", fullPage: true });

  // The organizer sees the count and no text. No other person gets a note before the reveal.
  await expect(page.getByText("Gift notes in: 2 of 3.")).toBeVisible(SLOW);
  await expect(rohan.getByText(/Gift notes in/)).toHaveCount(0);
  for (const name of ["Anita", "Meera"]) expect(JSON.stringify(await stateOf(pages[name]))).not.toContain("Coffee is on me");
  await rohan.reload();
  await expect(rohan.getByRole("textbox", { name: "Gift note", exact: true })).toHaveValue("Coffee is on me tomorrow.");

  // Each reveal step shows the pair with its note, a link for a web address, or the words for no note.
  const expected: Record<string, string> = { Rohan: "Coffee is on me tomorrow.", Meera: "https://example.com/a-song-for-you", Anita: "No note yet" };
  for (const step of [1, 2, 3]) {
    await page.getByRole("button", { name: "Reveal next" }).click();
    if (step < 3) {
      await expect(page.getByRole("heading", { name: `Pair ${step} of 3` })).toBeVisible();
      const giver = (await page.locator(".reveal__pair .drawcard__name").first().textContent())!;
      await expect(page.locator(".reveal__note")).toHaveText(expected[giver]);
      if (giver === "Meera") await expect(page.locator(".reveal__note a")).toHaveAttribute("href", "https://example.com/a-song-for-you");
      if (step === 1) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: "test-results/note-reveal-phone.png", fullPage: true });
        // The giver of the shown pair cannot change the note any more. Another giver still can.
        await expect(pages[giver].getByText("Your pair is revealed, so the note is closed.")).toBeVisible(SLOW);
        const late = await pages[giver].request.put(roomApi(pages[giver], "note"), { data: { text: "Too late" } });
        expect(late.status()).toBe(409);
        expect((await late.json()).error.code).toBe("NOTE_CLOSED");
      }
    }
  }

  // The ring keeps every note, on every screen.
  for (const person of Object.values(pages)) {
    await expect(person.getByRole("heading", { name: "The ring" })).toBeVisible(SLOW);
    for (const [giver, note] of Object.entries(expected)) {
      await expect(person.getByRole("listitem").filter({ hasText: `${giver}gave to` })).toContainText(note);
    }
  }
  await expect(page.getByRole("link", { name: "Start your December room" })).toBeVisible();
  for (const name of ["Rohan", "Meera"]) await pages[name].context().close();
});

test("the note route refuses a December room, a bad text and a caller with no identity", async ({ page, playwright }) => {
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, "0");
  await createRoom(page, "Family exchange", "Anita", `${inThirtyDays.getFullYear()}-${pad(inThirtyDays.getMonth() + 1)}-${pad(inThirtyDays.getDate())}`);

  const december = await page.request.put(roomApi(page, "note"), { data: { text: "A note" } });
  expect(december.status()).toBe(409);
  expect((await december.json()).error.code).toBe("NO_NOTES");
  expect((await page.request.put(roomApi(page, "note"), { data: { text: 42 } })).status()).toBe(422);

  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });
  expect((await anonymous.put("/api/rooms/ZZZZZZZZ/note", { data: { text: "A note" } })).status()).toBe(401);
  await anonymous.dispose();
});
