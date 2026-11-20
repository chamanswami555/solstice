import { expect, test } from "@playwright/test";

// These checks write nothing. They also run against a public URL: E2E_BASE_URL=https://... npm run test:e2e

const SECURITY_HEADERS: Record<string, RegExp> = {
  "content-security-policy": /default-src 'self';.*frame-ancestors 'none'/,
  "strict-transport-security": /max-age=\d{8,}/,
  "x-content-type-options": /^nosniff$/,
  "x-frame-options": /^DENY$/,
  "referrer-policy": /^no-referrer$/,
  "permissions-policy": /camera=\(\)/,
};

for (const path of ["/", "/r/ZZZZZZZZ", "/api/health", "/api/rooms/ZZZZZZZZ", "/no-such-page"]) {
  test(`the answer for ${path} carries the security headers`, async ({ request }) => {
    const response = await request.get(path);

    for (const [name, shape] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers()[name] ?? "", name).toMatch(shape);
    }
  });
}

test("the first screen works under the content security policy, in 3 seconds or less", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console error: ${message.text()}`);
  });
  const started = Date.now();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const shownAfterMs = Date.now() - started;
  // The date field comes from script, so it proves that the policy did not block the page's own code.
  await page.getByRole("radio", { name: /December room/ }).check();
  await expect(page.getByLabel("Exchange date")).toBeVisible();

  expect(problems).toEqual([]);
  expect(shownAfterMs).toBeLessThanOrEqual(3000);
});

test("the server and the database answer", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  // The door of a room reads the database: a clean 404 means the query ran.
  const door = await request.get("/api/rooms/ZZZZZZZZ");
  expect(door.status()).toBe(404);
  expect((await door.json()).error.code).toBe("ROOM_NOT_FOUND");
  const state = await request.get("/api/rooms/ZZZZZZZZ/state");
  expect(state.status()).toBe(401);
});
