import { expect, test, type Page } from "@playwright/test";

async function createRoom(page: Page, roomName: string, displayName: string) {
  await page.goto("/");
  await page.getByLabel("Room name").fill(roomName);
  await page.getByLabel("Your display name").fill(displayName);
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(roomName);
}

test("an organizer creates a room and gets an invite link and a return link", async ({ page }) => {
  await createRoom(page, "Office exchange 2026", "Anita");

  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{8}$/);
  const invite = await page.getByRole("textbox", { name: "Invite link" }).inputValue();
  const returnLink = await page.getByRole("textbox", { name: "Your return link" }).inputValue();
  expect(invite).toMatch(/\/r\/[A-Z0-9]{8}$/);
  expect(returnLink.startsWith(`${invite}#k=`)).toBe(true);
  await expect(page.getByRole("listitem").filter({ hasText: "Anita" })).toContainText("organizer, you");
  await expect(page.locator(".room__meta")).toHaveText("Tonight round");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/room-phone.png", fullPage: true });

  await page.getByRole("button", { name: "I saved it" }).click();
  await expect(page.getByRole("textbox", { name: "Your return link" })).toHaveCount(0);
});

test("the return link opens the same identity in a second browser", async ({ page, browser }) => {
  await createRoom(page, "Family exchange", "Rohan");
  const returnLink = await page.getByRole("textbox", { name: "Your return link" }).inputValue();

  const secondDevice = await browser.newContext();
  const second = await secondDevice.newPage();
  await second.goto(returnLink);

  await expect(second.getByRole("heading", { level: 1 })).toHaveText("Family exchange");
  await expect(second.getByRole("listitem").filter({ hasText: "Rohan" })).toContainText("organizer, you");
  await expect(second).toHaveURL(/\/r\/[A-Z0-9]{8}$/);
  await expect(second.getByRole("textbox", { name: "Your return link" })).toHaveCount(0);
  await secondDevice.close();
});

test("a person outside the room sees its name and the join form, and no member", async ({ page, browser }) => {
  await createRoom(page, "Secret team room", "Meera");
  const invite = await page.getByRole("textbox", { name: "Invite link" }).inputValue();

  const strangerDevice = await browser.newContext();
  const stranger = await strangerDevice.newPage();
  await stranger.goto(invite);

  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("Secret team room");
  await expect(stranger.getByRole("button", { name: "Join room" })).toBeVisible();
  await expect(stranger.getByText("Meera")).toHaveCount(0);
  await expect(stranger.getByRole("textbox", { name: "Invite link" })).toHaveCount(0);
  await strangerDevice.close();
});

test("a second room keeps the same person and shows no new return link", async ({ page }) => {
  await createRoom(page, "First room", "Kabir");
  await createRoom(page, "Second room", "Kabir");

  await expect(page.getByRole("textbox", { name: "Your return link" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Invite link" })).toBeVisible();
});

test("the create screen marks an empty name and sends nothing", async ({ page }) => {
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create room" }).click();

  await expect(page.getByText("Enter a name for the room.")).toBeVisible();
  await expect(page.getByLabel("Room name")).toBeFocused();
  expect(posts).toBe(0);
});

test.describe("the API", () => {
  const tonight = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" };

  test("answers a wrong body with status 422 and one sentence for each field", async ({ request }) => {
    const response = await request.post("/api/rooms", { data: { kind: "december", roomName: "", displayName: "Anita" } });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error.fields).sort()).toEqual(["exchangeDate", "roomName"]);
  });

  test("refuses a body that is not JSON", async ({ request }) => {
    const response = await request.post("/api/rooms", { form: tonight });

    expect(response.status()).toBe(415);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  test("sets a signed cookie that page scripts cannot read", async ({ request }) => {
    const response = await request.post("/api/rooms", { data: tonight });

    expect(response.status()).toBe(201);
    const cookie = response.headers()["set-cookie"];
    expect(cookie).toMatch(/^solstice_id=p[0-9a-f]{24}\.[A-Za-z0-9_-]+;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Secure/i);
  });

  test("gives no room state to a caller with no cookie or a forged cookie", async ({ request, playwright }) => {
    const created = await request.post("/api/rooms", { data: tonight });
    const { room } = await created.json();
    const signed = created.headers()["set-cookie"].split(";")[0].split("=")[1];
    const forged = `p${"0".repeat(24)}.${signed.split(".")[1]}`;

    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3412" });
    const withForged = await playwright.request.newContext({
      baseURL: "http://localhost:3412",
      extraHTTPHeaders: { cookie: `solstice_id=${forged}` },
    });

    expect((await anonymous.get(`/api/rooms/${room.code}/state`)).status()).toBe(401);
    expect((await withForged.get(`/api/rooms/${room.code}/state`)).status()).toBe(401);
    expect((await request.get(`/api/rooms/${room.code}/state`)).status()).toBe(200);
    await anonymous.dispose();
    await withForged.dispose();
  });

  test("answers an unknown return secret with status 404", async ({ request }) => {
    const response = await request.post("/api/identity/return", { data: { returnSecret: "x".repeat(43) } });

    expect(response.status()).toBe(404);
  });
});

test("on a phone with a share sheet, the organizer shares the invite link in one tap", async ({ page }) => {
  // The test browser has no share sheet: a stand-in records what the page hands to it.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void ((window as unknown as { shared: ShareData }).shared = data) });
  });
  await page.goto("/");
  await page.getByLabel("Room name").fill("Friday dinner");
  await page.getByLabel("Your display name").fill("Anita");
  await page.getByRole("button", { name: "Create room" }).click();
  const invite = await page.getByRole("textbox", { name: "Invite link" }).inputValue();
  await page.getByRole("button", { name: "Share the invite" }).click();
  const shared = await page.evaluate(() => (window as unknown as { shared: ShareData }).shared);
  expect(shared).toEqual({ title: "Friday dinner", text: "Join our Secret Santa: Friday dinner", url: invite });
});
