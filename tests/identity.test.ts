import { describe, expect, it } from "vitest";
import {
  hashReturnSecret,
  newPersonId,
  newReturnSecret,
  newRoomCode,
  readIdentity,
  signIdentity,
} from "@/lib/identity";

const SECRET = "k3Jq9vXw2LmN8pRt5YbZ1cDf7GhS4aUe";
const OTHER_SECRET = "Zx8Wq2Lp6Rt4Yv0Nb3Mc7Kd9Fg1Hs5Ja";

describe("identity cookie", () => {
  it("reads back the person id that it signed", () => {
    const personId = newPersonId();

    expect(readIdentity(signIdentity(personId, SECRET), SECRET)).toBe(personId);
  });

  it("refuses a cookie whose person id was changed", () => {
    const cookie = signIdentity(`p${"1".repeat(24)}`, SECRET);
    const forged = cookie.replace("1".repeat(24), "2".repeat(24));

    expect(readIdentity(forged, SECRET)).toBeNull();
  });

  it("refuses a cookie whose signature was changed", () => {
    // The first character carries six signature bits. The last one carries only four, so a
    // change there can decode to the same bytes.
    for (let run = 0; run < 200; run += 1) {
      const [personId, sig] = signIdentity(newPersonId(), SECRET).split(".");
      const first = sig[0] === "A" ? "B" : "A";

      expect(readIdentity(`${personId}.${first}${sig.slice(1)}`, SECRET)).toBeNull();
    }
  });

  it("refuses a cookie that another secret signed", () => {
    const cookie = signIdentity(newPersonId(), OTHER_SECRET);

    expect(readIdentity(cookie, SECRET)).toBeNull();
  });

  it.each(["", "no-dot-here", ".", "p123.", ".abc", "a.b.c"])("refuses the malformed value %j", (value) => {
    expect(readIdentity(value, SECRET)).toBeNull();
  });

  it("refuses a missing cookie", () => {
    expect(readIdentity(undefined, SECRET)).toBeNull();
  });
});

describe("generated values", () => {
  it("makes person ids that the database accepts and that do not repeat", () => {
    const ids = Array.from({ length: 500 }, newPersonId);

    expect(ids.every((id) => /^[A-Za-z0-9-]{8,64}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(500);
  });

  it("makes room codes that the database accepts, with no look-alike characters", () => {
    const codes = Array.from({ length: 500 }, newRoomCode);

    expect(codes.every((code) => /^[A-Z0-9]{8}$/.test(code))).toBe(true);
    expect(codes.join("")).not.toMatch(/[IO01]/);
    expect(new Set(codes).size).toBe(500);
  });

  it("stores a return secret only as a hash", () => {
    const secret = newReturnSecret();
    const hash = hashReturnSecret(secret);

    expect(secret.length).toBeGreaterThanOrEqual(40);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
    expect(hashReturnSecret(secret)).toBe(hash);
    expect(hashReturnSecret(newReturnSecret())).not.toBe(hash);
  });
});
