/**
 * Criterion 8 of the spec: a person can do every action with the keyboard only, and the focus is
 * visible on every element that the Tab key reaches. No mouse click in this file.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Presses Tab until the target has the focus. Every element on the way must show a visible focus ring. */
async function tabTo(page: Page, target: Locator, maxPresses = 120): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return { ok: true, what: "body" };
      // A radio card draws its ring on the card around the hidden-looking radio.
      const drawn = element.closest(".choice") ?? element;
      const style = getComputedStyle(drawn);
      const visible = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2 && style.outlineColor !== "rgba(0, 0, 0, 0)";
      return { ok: visible, what: `${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? ""}` };
    });
    expect(ring.ok, `no visible focus ring on ${ring.what}`).toBe(true);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`the Tab key did not reach ${target} in ${maxPresses} presses`);
}

test("a person creates a room with the keyboard only", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  await tabTo(page, page.getByLabel("Room name"));
  await page.keyboard.type("Office exchange 2026");
  await tabTo(page, page.getByLabel("Your display name"));
  await page.keyboard.type("Anita");
  // The radio group: arrow keys move the choice, as in every radio group.
  await tabTo(page, page.getByRole("radio", { name: /Tonight round/ }));
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: /December room/ })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Tonight round/ })).toBeChecked();
  await tabTo(page, page.getByRole("button", { name: "Create room" }));
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Office exchange 2026");
  await tabTo(page, page.getByRole("button", { name: "I saved it" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Save your return link" })).toHaveCount(0);
});

test("a visitor goes through the whole demo room with the keyboard only", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForLoadState("load");
  await tabTo(page, page.getByRole("button", { name: "Try the demo room" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo room");

  await tabTo(page, page.getByRole("button", { name: "Draw names" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Yes, draw" }));
  await page.keyboard.press("Enter");
  const receiver = (await page.locator(".drawcard .drawcard__name").textContent())!;

  // A question in the secret talk, sent with the Enter key. The messages can be scrolled with the keyboard.
  await tabTo(page, page.getByLabel(`Message to ${receiver}`));
  await page.keyboard.type("What size do you wear?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log", { name: `Messages with ${receiver}` }).getByText("Demo answer")).toBeVisible();
  await tabTo(page, page.getByRole("log", { name: "Messages with your secret giver" }));

  await tabTo(page, page.getByRole("textbox", { name: "Gift note", exact: true }));
  await page.keyboard.type("A song for you.");
  await tabTo(page, page.getByRole("button", { name: "Save note" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Gift notes in: 4 of 4.")).toBeVisible();

  for (const step of [1, 2, 3, 4]) {
    await tabTo(page, page.getByRole("button", { name: "Reveal next" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: step < 4 ? `Pair ${step} of 4` : "The ring" })).toBeVisible();
  }
  await tabTo(page, page.getByRole("link", { name: "Start your December room" }));
  await tabTo(page, page.getByRole("link", { name: "Usage numbers" }));
});
