import { expect, test } from "@playwright/test";

const room = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" };

test("one client address makes 10 rooms in an hour, and the next request is refused with a plain sentence", async ({ playwright }) => {
  // The host tells the server the client address in this header. The test plays the host.
  const client = await playwright.request.newContext({ baseURL: "http://localhost:3412", extraHTTPHeaders: { "x-forwarded-for": "203.0.113.50" } });
  for (let made = 0; made < 9; made += 1) expect((await client.post("/api/rooms", { data: room })).status()).toBe(201);
  expect((await client.post("/api/demo", { data: {} })).status()).toBe(201);

  const eleventh = await client.post("/api/rooms", { data: room });
  expect(eleventh.status()).toBe(429);
  expect(await eleventh.json()).toEqual({ error: { code: "RATE_LIMITED", message: "You made many rooms in a short time. Try again in an hour." } });
  expect((await client.post("/api/demo", { data: {} })).status()).toBe(429);

  // Another address is not touched by it.
  const other = await playwright.request.newContext({ baseURL: "http://localhost:3412", extraHTTPHeaders: { "x-forwarded-for": "203.0.113.51" } });
  expect((await other.post("/api/rooms", { data: room })).status()).toBe(201);
  await client.dispose();
  await other.dispose();
});
