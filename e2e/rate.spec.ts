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

test("one client address brings 60 new people in an hour, and the next new person is refused; people with a cookie are not counted", async ({ playwright }) => {
  test.setTimeout(120_000);
  const BASE = "http://localhost:3412";
  const fromAddress = (address: string) => playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": address } });
  // Two rooms made from this machine (not limited), because one room holds 40 people.
  const organizer = await playwright.request.newContext({ baseURL: BASE });
  const codes: string[] = [];
  for (let made = 0; made < 2; made += 1) codes.push((await (await organizer.post("/api/rooms", { data: room })).json()).room.code);

  // Each join is a new browser with no cookie from one address: a new person each time.
  const joinAsNew = async (code: string, name: string) => {
    const visitor = await fromAddress("203.0.113.60");
    const answer = await visitor.post(`/api/rooms/${code}/members`, { data: { displayName: name } });
    return { visitor, answer };
  };
  let first: Awaited<ReturnType<typeof playwright.request.newContext>> | null = null;
  for (let joined = 0; joined < 60; joined += 1) {
    const { visitor, answer } = await joinAsNew(codes[joined < 39 ? 0 : 1], `Guest ${joined}`);
    expect(answer.status(), `join ${joined + 1}`).toBe(201);
    if (joined === 0) first = visitor;
    else await visitor.dispose();
  }

  const refused = await joinAsNew(codes[1], "Guest 60");
  expect(refused.answer.status()).toBe(429);
  expect(await refused.answer.json()).toEqual({
    error: { code: "RATE_LIMITED", message: "Many new people came from your network in a short time. Try again in an hour." },
  });
  expect((await refused.visitor.post("/api/rooms", { data: room })).status()).toBe(429);
  expect((await refused.visitor.post("/api/demo", { data: {} })).status()).toBe(429);
  await refused.visitor.dispose();

  // A person who has a cookie from the same address makes no new person: still let in.
  expect((await first!.post(`/api/rooms/${codes[1]}/members`, { data: { displayName: "Guest 0" } })).status()).toBe(201);
  expect((await first!.post("/api/rooms", { data: room })).status()).toBe(201);
  // Another address is not touched by it.
  const other = await fromAddress("203.0.113.61");
  expect((await other.post(`/api/rooms/${codes[1]}/members`, { data: { displayName: "Neighbour" } })).status()).toBe(201);
  for (const context of [first!, other, organizer]) await context.dispose();
});
