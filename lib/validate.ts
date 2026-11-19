/** Checks of request bodies. The server trusts no value before it passed one of these. */
import { LIMITS } from "@/lib/limits";

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
  if (!displayName) fields.displayName = "Enter the name your group knows you by.";
  else if (displayName.length > LIMITS.displayNameMax) {
    fields.displayName = `Use ${LIMITS.displayNameMax} characters or fewer.`;
  }

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
