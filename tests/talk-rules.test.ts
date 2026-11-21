import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/limits";
import { parseCheerStep } from "@/lib/talk-rules";

describe("parseCheerStep", () => {
  it("reads the step of a cheer", () => {
    expect(parseCheerStep({ step: 1 })).toBe(1);
    expect(parseCheerStep({ step: LIMITS.roomPeopleMax })).toBe(LIMITS.roomPeopleMax);
  });

  it.each([
    ["no content", null],
    ["a text", "1"],
    ["no step", {}],
    ["a step as text", { step: "2" }],
    ["step 0", { step: 0 }],
    ["a step past the largest room", { step: LIMITS.roomPeopleMax + 1 }],
    ["a fraction", { step: 1.5 }],
    ["a negative step", { step: -3 }],
  ])("refuses %s", (_, content) => {
    expect(parseCheerStep(content)).toBeNull();
  });
});
