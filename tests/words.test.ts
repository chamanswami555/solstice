import { describe, expect, it } from "vitest";
import { parseCreateRoom, parseJoin, parseWishes } from "@/lib/validate";
import { BLOCKED_WORDS, hasBlockedWord, isReservedName } from "@/lib/word-list";

const TODAY = new Date("2026-11-20T10:00:00Z");
const tonight = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" };

describe("the word list", () => {
  it("fits the limits of the chat service: 50 words at most, 32 characters each, lower-case letters only", () => {
    expect(BLOCKED_WORDS.length).toBeGreaterThan(0);
    expect(BLOCKED_WORDS.length).toBeLessThanOrEqual(50);
    for (const word of BLOCKED_WORDS) expect(word).toMatch(/^[a-z]{2,32}$/);
    expect(new Set(BLOCKED_WORDS).size).toBe(BLOCKED_WORDS.length);
  });

  it.each(["You BASTARD", "what a b.i.t.c.h", "oh shit!", "Chutiya hai kya", "SHIT"])("finds a listed word in %j", (text) => {
    expect(hasBlockedWord(text)).toBe(true);
  });

  it.each(["A class on Scunthorpe history", "Dickens wrote this", "Shitake mushrooms", "A warm scarf", ""])("finds none in %j", (text) => {
    expect(hasBlockedWord(text)).toBe(false);
  });
});

describe("reserved names", () => {
  it.each(["You", " you ", "YOUR SECRET GIVER", "Secret  giver", "Someone who left", "Organizer", "guest", "Solstice", "System", "admin", "Demo"])(
    "refuses %j as a display name",
    (name) => {
      expect(isReservedName(name)).toBe(true);
    },
  );

  it.each(["Youssef", "Anita", "Guestav", "Demi"])("allows %j", (name) => {
    expect(isReservedName(name)).toBe(false);
  });
});

describe("texts that people write", () => {
  it("refuses a listed word in a room name, a display name and a budget", () => {
    expect(parseCreateRoom({ ...tonight, roomName: "Shit office" }, TODAY)).toMatchObject({ ok: false, fields: { roomName: "Use kinder words." } });
    expect(parseCreateRoom({ ...tonight, displayName: "Bastard" }, TODAY)).toMatchObject({ ok: false, fields: { displayName: "Use kinder words." } });
    expect(parseCreateRoom({ ...tonight, kind: "december", exchangeDate: "2026-12-24", budget: "500 for a bitch" }, TODAY)).toMatchObject({
      ok: false,
      fields: { budget: "Use kinder words." },
    });
  });

  it("refuses a reserved display name at create and at join", () => {
    const message = "The website uses this name. Pick another one.";

    expect(parseCreateRoom({ ...tonight, displayName: "Your secret giver" }, TODAY)).toMatchObject({ ok: false, fields: { displayName: message } });
    expect(parseJoin({ displayName: "You" })).toMatchObject({ ok: false, fields: { displayName: message } });
    expect(parseJoin({ displayName: "Bitch" })).toMatchObject({ ok: false, fields: { displayName: "Use kinder words." } });
    expect(parseJoin({ displayName: "Youssef" })).toMatchObject({ ok: true });
  });

  it("refuses a listed word in a wish", () => {
    expect(parseWishes({ wishes: ["A warm scarf", "some shit"] })).toMatchObject({ ok: false, fields: { wishes: "Use kinder words." } });
  });
});
