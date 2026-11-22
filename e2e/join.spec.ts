import { expect, test, type Page } from "@playwright/test";

async function createRoom(page: Page, roomName: string, displayName: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Room name").fill(roomName);
  await page.getByLabel("Your display name").fill(displayName);
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(roomName);
  return page.getByRole("textbox", { name: "Invite link" }).inputValue();
}

test("a second person joins by the invite link and both see each other", async ({ page, browser }) => {
  const invite = await createRoom(page, "Office exchange 2026", "Anita");

  const phone = await browser.newContext();
  const joiner = await phone.newPage();
  await joiner.goto(invite);
  // The invited person learns what they join and what comes next.
  await expect(joiner.getByText("You are invited to a Secret Santa. Join with your name. After the draw you get one person to give a gift to.")).toBeVisible();
  await joiner.getByLabel("Your display name").fill("Rohan");
  await joiner.getByRole("button", { name: "Join room" }).click();

  await expect(joiner.getByRole("listitem").filter({ hasText: "Rohan" })).toContainText("you");
  await expect(joiner.getByRole("listitem").filter({ hasText: "Anita" })).toContainText("organizer");
  await expect(joiner.getByRole("textbox", { name: "Your return link" })).toHaveValue(/#k=/);
  // The organizer has no signal yet: the room loads its state every 10 seconds.
  await expect(page.getByRole("listitem").filter({ hasText: "Rohan" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "In the room: 2" })).toBeVisible();
  await phone.close();
});

test("a name that is taken in the room is marked on the field", async ({ page, browser }) => {
  const invite = await createRoom(page, "Family exchange", "Meera");

  const phone = await browser.newContext();
  const joiner = await phone.newPage();
  await joiner.goto(invite);
  await joiner.getByLabel("Your display name").fill("meera");
  await joiner.getByRole("button", { name: "Join room" }).click();

  await expect(joiner.getByText("This name is taken in this room. Use another one.")).toBeVisible();
  await expect(joiner.getByRole("button", { name: "Join room" })).toBeVisible();
  await joiner.setViewportSize({ width: 390, height: 844 });
  await joiner.screenshot({ path: "test-results/join-phone.png", fullPage: true });
  await phone.close();
});

test("a link to a room that does not exist says so", async ({ page }) => {
  await page.goto("/r/ZZZZZZZZ");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This room does not exist");
  await expect(page.getByRole("link", { name: "Start a new room" })).toHaveAttribute("href", "/");
});

test("the join route answers a full or unknown room with one error shape", async ({ request }) => {
  const unknown = await request.post("/api/rooms/ZZZZZZZZ/members", { data: { displayName: "Rohan" } });
  const empty = await request.post("/api/rooms/ZZZZZZZZ/members", { data: { displayName: "  " } });

  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe("ROOM_NOT_FOUND");
  expect(empty.status()).toBe(422);
  expect(Object.keys((await empty.json()).error.fields)).toEqual(["displayName"]);
});

test("a browser that cannot run the script sees what to do on the room page", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/r/ZZZZZZZZ");
  await expect(page.getByText("If the room does not open in a few seconds, copy the link and open it in Chrome or Safari.")).toBeVisible();
  await context.close();
});
