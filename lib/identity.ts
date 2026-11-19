/**
 * Identity with no accounts. A browser holds one random person id in a signed cookie. A return
 * secret (shown one time, kept in the URL fragment) opens the same identity on a second device.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const IDENTITY_COOKIE = "solstice_id";

/** Cookie settings. The script of the page cannot read the cookie, and it travels over HTTPS in production. */
export const IDENTITY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
} as const;

// No I, O, 0 or 1: a person can read a code aloud with no mistake.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PERSON_ID = /^p[0-9a-f]{24}$/;

/** Also the Nexconn user id, so letters and digits only. */
export function newPersonId(): string {
  return `p${randomBytes(12).toString("hex")}`;
}

export function newRoomCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function newReturnSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The database stores this hash, never the secret. */
export function hashReturnSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function signature(personId: string, sessionSecret: string): Buffer {
  return createHmac("sha256", sessionSecret).update(personId).digest();
}

export function signIdentity(personId: string, sessionSecret: string): string {
  return `${personId}.${signature(personId, sessionSecret).toString("base64url")}`;
}

/** Returns the person id, or null when the cookie is missing, malformed or not signed by us. */
export function readIdentity(cookieValue: string | undefined, sessionSecret: string): string | null {
  const [personId, given, ...rest] = (cookieValue ?? "").split(".");
  if (rest.length > 0 || !given || !PERSON_ID.test(personId)) return null;
  const expected = signature(personId, sessionSecret);
  const actual = Buffer.from(given, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return personId;
}
