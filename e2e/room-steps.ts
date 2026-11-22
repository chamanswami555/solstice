import { expect, type Browser, type Page } from "@playwright/test";

/** Other screens learn of a change on the 10 second reload. */
export const SLOW = { timeout: 15_000 };

/** Creates a room on the first screen and returns its invite link. A date makes it a December room. */
export async function createRoom(page: Page, roomName: string, displayName: string, exchangeDate?: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Room name").fill(roomName);
  await page.getByLabel("Your display name").fill(displayName);
  if (exchangeDate) {
    await page.getByRole("radio", { name: /December room/ }).check();
    await page.getByLabel("Exchange date").fill(exchangeDate);
  }
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(roomName);
  return page.getByRole("textbox", { name: "Invite link" }).inputValue();
}

/** Joins the room as a new person in a browser of their own. */
export async function join(browser: Browser, invite: string, displayName: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(invite);
  await page.getByLabel("Your display name").fill(displayName);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.locator(".nextstep")).toBeVisible();
  // A guest joins after the draw, when the member list is in the fold at the end.
  if (await page.locator(".fold__summary").count()) await page.locator(".fold__summary").click();
  await expect(page.getByRole("listitem").filter({ hasText: displayName })).toContainText("you");
  return page;
}

/** The organizer draws the names for the given number of people in the room. */
export async function drawNames(organizer: Page, people: number): Promise<void> {
  await expect(organizer.getByRole("heading", { name: `In the room: ${people}` })).toBeVisible(SLOW);
  await organizer.getByRole("button", { name: "Draw names" }).click();
  await organizer.getByRole("button", { name: "Yes, draw" }).click();
  await expect(organizer.locator(".drawcard__name").first()).toBeVisible(SLOW);
}

/** The address of a room route for the room that this page shows. */
export function roomApi(page: Page, route: string): string {
  return `${page.url().replace("/r/", "/api/rooms/")}/${route}`;
}
