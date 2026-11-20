/** Checks of request bodies. The server trusts no value before it passed one of these. */
import { LIMITS } from "@/lib/limits";
import type { MaskSide } from "@/lib/mask";
import { hasBlockedWord } from "@/lib/word-list";

export type RoomKind = "december" | "tonight";

export type CreateRoomInput = {
  roomName: string;
  displayName: string;
  kind: RoomKind;
  /** yyyy-mm-dd, only for a December room. */
  exchangeDate: string | null;
  budget: string | null;
};

/** One plain sentence for each wrong field, keyed by the field name of the form. */
export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; fields: FieldErrors };

const DAY_MS = 24 * 60 * 60 * 1000;

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

/** Returns the error sentence, or null when the date is a real day in the allowed range. */
function exchangeDateError(value: unknown, now: Date): string | null {
  const text = textOf(value);
  if (!text) return "Pick the date of the exchange.";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) {
    return "Enter the date as year, month and day.";
  }
  // The visitor can be up to a day ahead of the server clock, so "yesterday" on the server is allowed.
  const daysAhead = (day.getTime() - now.getTime()) / DAY_MS;
  if (daysAhead < -1) return "Pick a date that is not in the past.";
  if (daysAhead > LIMITS.exchangeDateMaxDaysAhead) return "Pick a date in the next two years.";
  return null;
}

function displayNameError(displayName: string | null): string | null {
  if (!displayName) return "Enter the name your group knows you by.";
  if (displayName.length > LIMITS.displayNameMax) return `Use ${LIMITS.displayNameMax} characters or fewer.`;
  return null;
}

export function parseJoin(body: unknown): Parsed<{ displayName: string }> {
  const displayName = textOf((body as { displayName?: unknown } | null)?.displayName);
  const nameError = displayNameError(displayName);
  return nameError ? { ok: false, fields: { displayName: nameError } } : { ok: true, value: { displayName: displayName! } };
}

/** The step is the number of pairs on the organizer's screen. A room has one pair for each member at most. */
export function parseReveal(body: unknown): Parsed<{ step: number }> {
  const step = (body as { step?: unknown } | null)?.step;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > LIMITS.roomPeopleMax) {
    return { ok: false, fields: { step: "Send the number of pairs that your screen shows." } };
  }
  return { ok: true, value: { step } };
}

export function parseMaskMessage(body: unknown): Parsed<{ side: MaskSide; text: string }> {
  const input = (body ?? {}) as { side?: unknown; text?: unknown };
  if (input.side !== "giving" && input.side !== "receiving") return { ok: false, fields: { side: "Name the thread: giving or receiving." } };
  const text = textOf(input.text);
  if (!text) return { ok: false, fields: { text: "Write a message." } };
  if (text.length > LIMITS.maskTextMax) return { ok: false, fields: { text: `Use ${LIMITS.maskTextMax} characters or fewer.` } };
  if (hasBlockedWord(text)) return { ok: false, fields: { text: "Use kinder words. This message was not sent." } };
  return { ok: true, value: { side: input.side, text } };
}

export function parseMaskMute(body: unknown): Parsed<{ side: MaskSide; muted: boolean }> {
  const input = (body ?? {}) as { side?: unknown; muted?: unknown };
  if (input.side !== "giving" && input.side !== "receiving") return { ok: false, fields: { side: "Name the thread: giving or receiving." } };
  if (typeof input.muted !== "boolean") return { ok: false, fields: { muted: "Send muted as true or false." } };
  return { ok: true, value: { side: input.side, muted: input.muted } };
}

/** Each wish is trimmed, and an empty one is dropped. So a form with 5 fields can send all of them. */
export function parseWishes(body: unknown): Parsed<{ wishes: string[] }> {
  const given = (body as { wishes?: unknown } | null)?.wishes;
  if (!Array.isArray(given) || given.some((wish) => typeof wish !== "string")) {
    return { ok: false, fields: { wishes: "Send the wishes as a list of texts." } };
  }
  const wishes = given.map((wish: string) => wish.trim()).filter((wish) => wish !== "");
  if (wishes.length > LIMITS.wishesMax) return { ok: false, fields: { wishes: `Write ${LIMITS.wishesMax} wishes or fewer.` } };
  if (wishes.some((wish) => wish.length > LIMITS.wishTextMax)) {
    return { ok: false, fields: { wishes: `Use ${LIMITS.wishTextMax} characters or fewer for each wish.` } };
  }
  return { ok: true, value: { wishes } };
}

export function parseCreateRoom(body: unknown, now: Date = new Date()): Parsed<CreateRoomInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, fields: { form: "Send the room details as one object." } };
  }
  const input = body as Record<string, unknown>;
  const fields: FieldErrors = {};

  const roomName = textOf(input.roomName);
  if (!roomName) fields.roomName = "Enter a name for the room.";
  else if (roomName.length > LIMITS.roomNameMax) fields.roomName = `Use ${LIMITS.roomNameMax} characters or fewer.`;

  const displayName = textOf(input.displayName);
  const nameError = displayNameError(displayName);
  if (nameError) fields.displayName = nameError;

  const kind = input.kind === "december" || input.kind === "tonight" ? input.kind : null;
  if (!kind) fields.kind = "Pick a kind of room.";

  let exchangeDate: string | null = null;
  let budget: string | null = null;
  if (kind === "december") {
    const dateError = exchangeDateError(input.exchangeDate, now);
    if (dateError) fields.exchangeDate = dateError;
    else exchangeDate = textOf(input.exchangeDate);

    budget = textOf(input.budget) || null;
    if (budget && budget.length > LIMITS.budgetMax) fields.budget = `Use ${LIMITS.budgetMax} characters or fewer.`;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { roomName: roomName!, displayName: displayName!, kind: kind!, exchangeDate, budget } };
}
