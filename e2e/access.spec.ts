/**
 * The security matrix: every route of a room, called by every kind of caller, with the status that
 * each one must get. The room is in the state "drawn, reveal not started". No call here changes
 * who is in the room or what the draw is.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { IDENTITY_COOKIE, signIdentity } from "../lib/identity";
import { E2E_SESSION_SECRET } from "../playwright.config";

const BASE = "http://localhost:3412";
const room = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" };

type Caller = "organizer" | "member" | "guest" | "outsider" | "removed" | "unknown person" | "forged cookie" | "no cookie";
const CALLERS: Caller[] = ["organizer", "member", "guest", "outsider", "removed", "unknown person", "forged cookie", "no cookie"];

type Call = { route: string; method: "GET" | "POST" | "PUT" | "DELETE"; path: string; data?: object; expected: Record<Caller, number> };

/** Shorthand for the usual answer of a route that only members may use. */
const membersOnly = (organizer: number, member: number, guest: number): Record<Caller, number> => ({
  organizer,
  member,
  guest,
  outsider: 404,
  removed: 404,
  "unknown person": 404,
  "forged cookie": 401,
  "no cookie": 401,
});

test("every route gives each kind of caller only what that caller may have", async ({ playwright }) => {
  test.setTimeout(120_000);
  const context = (headers: Record<string, string> = {}) => playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: headers });
  const people: Partial<Record<Caller, APIRequestContext>> = {};

  // The organizer makes the room. Three members and one person to be removed join. The removal, then the draw, then a guest.
  people.organizer = await context();
  const made = await (await people.organizer.post("/api/rooms", { data: room })).json();
  const code: string = made.room.code;
  const join = async (name: string) => {
    const person = await context();
    expect((await person.post(`/api/rooms/${code}/members`, { data: { displayName: name } })).status()).toBe(201);
    return person;
  };
  people.member = await join("Rohan");
  await join("Meera");
  people.removed = await join("Kabir");
  expect((await people.organizer.delete(`/api/rooms/${code}/members/Kabir`, { data: {} })).status()).toBe(204);
  await join("Sana");
  expect((await people.organizer.post(`/api/rooms/${code}/draw`, { data: {} })).status()).toBe(201);
  people.guest = await join("Dev");
  people.outsider = await context();
  expect((await people.outsider.post("/api/rooms", { data: { ...room, roomName: "Other room" } })).status()).toBe(201);
  people["unknown person"] = await context({ cookie: `${IDENTITY_COOKIE}=${signIdentity(`p${"0".repeat(20)}dead`, E2E_SESSION_SECRET)}` });
  const member = (await people.member.get(`/api/rooms/${code}/state`).then((answer) => answer.json())).me.talkId as string;
  people["forged cookie"] = await context({ cookie: `${IDENTITY_COOKIE}=${signIdentity(member, "not-the-secret-of-this-server-000000")}` });
  people["no cookie"] = await context();

  const room$ = `/api/rooms/${code}`;
  const calls: Call[] = [
    { route: "GET door", method: "GET", path: room$, expected: Object.fromEntries(CALLERS.map((caller) => [caller, 200])) as Record<Caller, number> },
    { route: "GET state", method: "GET", path: `${room$}/state`, expected: membersOnly(200, 200, 200) },
    { route: "GET mask", method: "GET", path: `${room$}/mask`, expected: membersOnly(200, 200, 200) },
    { route: "POST draw", method: "POST", path: `${room$}/draw`, data: {}, expected: { ...membersOnly(409, 403, 403) } },
    // A step ahead of the room moves nothing, so the matrix stays in one state.
    { route: "POST reveal", method: "POST", path: `${room$}/reveal`, data: { step: 9 }, expected: membersOnly(200, 403, 403) },
    { route: "PUT wishes", method: "PUT", path: `${room$}/wishes`, data: { wishes: ["A warm scarf"] }, expected: membersOnly(200, 200, 403) },
    { route: "PUT note", method: "PUT", path: `${room$}/note`, data: { text: "A note" }, expected: membersOnly(200, 200, 403) },
    { route: "PUT mask mute", method: "PUT", path: `${room$}/mask/mute`, data: { side: "giving", muted: false }, expected: membersOnly(200, 200, 404) },
    { route: "POST mask", method: "POST", path: `${room$}/mask`, data: { side: "giving", text: "Hello" }, expected: membersOnly(201, 201, 404) },
    { route: "DELETE member", method: "DELETE", path: `${room$}/members/Meera`, data: {}, expected: membersOnly(409, 403, 403) },
    // Room talk is switched off in this run: the route says so before it looks at the room, for any caller with a cookie.
    {
      route: "POST token (chat off)",
      method: "POST",
      path: `${room$}/token`,
      data: {},
      expected: { ...membersOnly(503, 503, 503), outsider: 503, removed: 503, "unknown person": 503 },
    },
  ];

  const matrix: string[] = [`| Route | ${CALLERS.join(" | ")} |`, `| --- | ${CALLERS.map(() => "---").join(" | ")} |`];
  const wrong: string[] = [];
  for (const call of calls) {
    const statuses: number[] = [];
    for (const caller of CALLERS) {
      const answer = await people[caller]!.fetch(call.path, { method: call.method, data: call.data });
      statuses.push(answer.status());
      if (answer.status() !== call.expected[caller]) wrong.push(`${call.route} as ${caller}: ${answer.status()}, expected ${call.expected[caller]}`);
      // No answer to anyone carries a row field or a person id of another person.
      const body = await answer.text();
      expect(body, `${call.route} as ${caller}`).not.toMatch(/person_id|room_id|giver_id|return_hash|organizer_id/);
    }
    matrix.push(`| ${call.route} | ${statuses.join(" | ")} |`);
  }
  console.log(`\n${matrix.join("\n")}\n`);
  expect(wrong).toEqual([]);

  // The removed person cannot come back; a missing room is the same answer as a room the caller is not in.
  expect((await people.removed!.post(`${room$}/members`, { data: { displayName: "Kabir" } })).status()).toBe(403);
  expect((await people.member!.get("/api/rooms/ZZZZZZZZ/state")).status()).toBe(404);
  expect((await people.member!.get("/api/rooms/ZZZZZZZZ")).status()).toBe(404);
  for (const person of Object.values(people)) await person!.dispose();
});

test("a route that changes something refuses a request that is not JSON, so a form on another site cannot use it", async ({ playwright }) => {
  const visitor = await playwright.request.newContext({ baseURL: BASE });
  const made = await (await visitor.post("/api/rooms", { data: room })).json();

  for (const [method, path] of [
    ["POST", "/api/rooms"],
    ["POST", "/api/demo"],
    ["POST", "/api/identity/return"],
    ["POST", `/api/rooms/${made.room.code}/members`],
    ["POST", `/api/rooms/${made.room.code}/draw`],
    ["POST", `/api/rooms/${made.room.code}/reveal`],
    ["POST", `/api/rooms/${made.room.code}/mask`],
    ["POST", `/api/rooms/${made.room.code}/token`],
    ["PUT", `/api/rooms/${made.room.code}/wishes`],
    ["PUT", `/api/rooms/${made.room.code}/note`],
    ["PUT", `/api/rooms/${made.room.code}/mask/mute`],
    ["DELETE", `/api/rooms/${made.room.code}/members/Anita`],
  ]) {
    const answer = await visitor.fetch(path, { method, headers: { "content-type": "application/x-www-form-urlencoded" }, data: "displayName=Mallory" });
    expect(answer.status(), `${method} ${path}`).toBe(415);
  }
  await visitor.dispose();
});
