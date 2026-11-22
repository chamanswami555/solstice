import { expect, test } from "@playwright/test";

test("the first screen shows the product name and loads with no error", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`status ${response.status()}: ${response.url()}`);
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draw names. Ask questions. Keep the secret.");
  await expect(page).toHaveTitle("Solstice");
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
  await expect(page.getByText("Got an invite link? Open it to join that room. This form makes a new room.")).toBeVisible();
  // The first screen shows the product's own reveal, with the words that it is an example.
  await expect(page.locator(".preview__giver")).toHaveText("Meera");
  await expect(page.getByText("An example of the reveal. Every phone shows the same pair, live.")).toBeVisible();
  expect(problems).toEqual([]);
});

for (const size of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`the first screen fits a ${size.name} with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/home-${size.name}.png`, fullPage: true });
  });
}
