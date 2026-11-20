import { describe, expect, it } from "vitest";
import { parseCreateRoom, parseReveal } from "@/lib/validate";

const TODAY = new Date("2026-11-20T10:00:00Z");
const tonight = { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight" };
const december = { ...tonight, kind: "december", exchangeDate: "2026-12-24", budget: "500 rupees" };

describe("parseCreateRoom", () => {
  it("accepts a tonight round and sets no date and no budget", () => {
    const result = parseCreateRoom({ ...tonight, exchangeDate: "2030-01-01", budget: "ignored" }, TODAY);

    expect(result).toEqual({
      ok: true,
      value: { roomName: "Office exchange 2026", displayName: "Anita", kind: "tonight", exchangeDate: null, budget: null },
    });
  });

  it("accepts a December room with a date and a budget", () => {
    const result = parseCreateRoom(december, TODAY);

    expect(result).toMatchObject({ ok: true, value: { kind: "december", exchangeDate: "2026-12-24", budget: "500 rupees" } });
  });

  it("trims spaces around the names", () => {
    const result = parseCreateRoom({ ...tonight, roomName: "  Office exchange 2026 ", displayName: " Anita  " }, TODAY);

    expect(result).toMatchObject({ ok: true, value: { roomName: "Office exchange 2026", displayName: "Anita" } });
  });

  it("stores an empty budget as no budget", () => {
    const result = parseCreateRoom({ ...december, budget: "   " }, TODAY);

    expect(result).toMatchObject({ ok: true, value: { budget: null } });
  });

  it.each([
    ["an empty room name", { ...tonight, roomName: "   " }, "roomName"],
    ["a room name of 61 characters", { ...tonight, roomName: "R".repeat(61) }, "roomName"],
    ["an empty display name", { ...tonight, displayName: "" }, "displayName"],
    ["a display name of 31 characters", { ...tonight, displayName: "N".repeat(31) }, "displayName"],
    ["a kind that does not exist", { ...tonight, kind: "demo" }, "kind"],
    ["a December room with no date", { ...december, exchangeDate: undefined }, "exchangeDate"],
    ["a date that is not a real day", { ...december, exchangeDate: "2026-02-30" }, "exchangeDate"],
    ["a date in the wrong form", { ...december, exchangeDate: "24/12/2026" }, "exchangeDate"],
    ["a date in the past", { ...december, exchangeDate: "2026-11-18" }, "exchangeDate"],
    ["a date more than two years away", { ...december, exchangeDate: "2029-01-01" }, "exchangeDate"],
    ["a budget of 41 characters", { ...december, budget: "B".repeat(41) }, "budget"],
    ["a number in place of a name", { ...tonight, roomName: 42 }, "roomName"],
  ])("refuses %s", (_case, body, field) => {
    const result = parseCreateRoom(body, TODAY);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fields)).toEqual([field]);
  });

  it.each([null, "text", 42, []])("refuses a body that is not an object: %j", (body) => {
    expect(parseCreateRoom(body, TODAY).ok).toBe(false);
  });

  it("reports every wrong field at one time", () => {
    const result = parseCreateRoom({ kind: "tonight" }, TODAY);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fields).sort()).toEqual(["displayName", "roomName"]);
  });
});

describe("parseReveal", () => {
  it("accepts the step that the screen shows", () => {
    expect(parseReveal({ step: 0 })).toEqual({ ok: true, value: { step: 0 } });
    expect(parseReveal({ step: 40 })).toEqual({ ok: true, value: { step: 40 } });
  });

  it.each([[{}], [null], [{ step: "1" }], [{ step: -1 }], [{ step: 1.5 }], [{ step: 41 }], [{ step: Number.NaN }]])(
    "refuses %j",
    (body) => {
      expect(parseReveal(body)).toMatchObject({ ok: false, fields: { step: expect.any(String) } });
    },
  );
});
