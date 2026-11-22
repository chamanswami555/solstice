import { expect, test, type Page } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

const stateOf = async (page: Page) => (await page.request.get(roomApi(page, "state"))).json();

test("a member writes wishes, and only the secret giver sees them after the draw", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  const rohan = await join(browser, invite, "Rohan");
  const meera = await join(browser, invite, "Meera");
  const everyone = [page, rohan, meera];

  await expect(rohan.getByText("Write up to 5 wishes. After the draw, only your secret giver sees them.")).toBeVisible();
  await rohan.getByLabel("Wish 1").fill("A warm scarf");
  // One field at first; a second empty field is dropped at the save.
  await expect(rohan.getByLabel("Wish 2")).toHaveCount(0);
  await rohan.getByRole("button", { name: "Add another wish" }).click();
  await expect(rohan.getByLabel("Wish 2")).toBeFocused();
  await rohan.getByRole("button", { name: "Add another wish" }).click();
  await rohan.getByLabel("Wish 3").fill("  Filter coffee beans ");
  await rohan.getByRole("button", { name: "Save wishes" }).click();
  await expect(rohan.getByRole("status").filter({ hasText: /^Saved\.$/ })).toBeVisible();
  // The empty field between the two is dropped, and the list survives a reload.
  await rohan.reload();
  await expect(rohan.getByLabel("Wish 1")).toHaveValue("A warm scarf");
  await expect(rohan.getByLabel("Wish 2")).toHaveValue("Filter coffee beans");
  await rohan.setViewportSize({ width: 390, height: 844 });
  await rohan.screenshot({ path: "test-results/wishes-phone.png", fullPage: true });

  // Before the draw nobody but Rohan gets the wishes.
  for (const person of [page, meera]) expect(JSON.stringify(await stateOf(person))).not.toContain("A warm scarf");

  // A wish that Rohan is still typing when the names are drawn stays in its field.
  await rohan.getByRole("button", { name: "Add another wish" }).click();
  await rohan.getByLabel("Wish 3").fill("A book of poems");
  await drawNames(page, 3);
  await expect(rohan.locator(".drawcard__name")).toBeVisible(SLOW);
  await rohan.locator(".fold__summary").click();
  await expect(rohan.getByLabel("Wish 3")).toHaveValue("A book of poems");
  await rohan.getByLabel("Wish 3").fill("");
  await rohan.locator(".fold__summary").click();
  let giver: Page | undefined;
  for (const person of everyone) {
    await expect(person.locator(".drawcard__name")).toBeVisible(SLOW);
    const state = await stateOf(person);
    if (state.draw.receiverName === "Rohan") giver = person;
    else if (person !== rohan) expect(JSON.stringify(state)).not.toContain("A warm scarf");
  }
  await expect(giver!.getByText("Wish list of Rohan:")).toBeVisible(SLOW);
  await expect(giver!.locator(".drawcard .wishlist li")).toHaveText(["A warm scarf", "Filter coffee beans"]);
  await giver!.setViewportSize({ width: 390, height: 844 });
  await giver!.screenshot({ path: "test-results/wishes-giver-phone.png", fullPage: true });

  // A change after the draw reaches the giver. After the draw the wish list is in the fold at the end.
  await rohan.locator(".fold__summary").click();
  await rohan.getByLabel("Wish 2").fill("A board game");
  await rohan.getByRole("button", { name: "Save wishes" }).click();
  await expect(giver!.locator(".drawcard .wishlist li")).toHaveText(["A warm scarf", "A board game"], SLOW);

  // The reveal closes the lists, on the screen and on the server.
  await page.getByRole("button", { name: "Reveal next" }).click();
  await expect(rohan.getByText("The reveal started, so the wish lists are closed.")).toBeVisible(SLOW);
  await expect(rohan.getByRole("button", { name: "Save wishes" })).toHaveCount(0);
  const late = await rohan.request.put(roomApi(rohan, "wishes"), { data: { wishes: ["A late wish"] } });
  expect(late.status()).toBe(409);
  expect((await late.json()).error.code).toBe("WISHES_CLOSED");

  const guest = await join(browser, invite, "Sana");
  await expect(guest.getByRole("heading", { name: "Your wish list" })).toHaveCount(0);
  const refused = await guest.request.put(roomApi(guest, "wishes"), { data: { wishes: ["A scarf"] } });
  expect(refused.status()).toBe(403);
  for (const person of [rohan, meera, guest]) await person.context().close();
});

test("the wishes route refuses a bad list and a caller with no identity", async ({ page, playwright }) => {
  await createRoom(page, "Small team", "Anita");
  const tooMany = await page.request.put(roomApi(page, "wishes"), { data: { wishes: ["1", "2", "3", "4", "5", "6"] } });
  expect(tooMany.status()).toBe(422);

  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });
  const response = await anonymous.put("/api/rooms/ZZZZZZZZ/wishes", { data: { wishes: [] } });
  expect(response.status()).toBe(401);
  await anonymous.dispose();
});
