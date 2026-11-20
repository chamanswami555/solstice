/** One shape for every error answer, and one safe way to read a JSON body. */
import { RoomError, type RoomErrorCode } from "@/lib/errors";
import { NexconnError } from "@/lib/nexconn-server";
import type { FieldErrors } from "@/lib/validate";

export type ApiError = { error: { code: string; message: string; fields?: FieldErrors } };

const MAX_BODY_BYTES = 10_000;

export function fail(status: number, code: string, message: string, fields?: FieldErrors): Response {
  const body: ApiError = { error: { code, message, ...(fields ? { fields } : {}) } };
  return Response.json(body, { status });
}

/**
 * Reads a small JSON body. A request from another site cannot send this content type without a
 * preflight, so the check is also a guard against forged form posts.
 */
export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.") };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: fail(413, "BODY_TOO_LARGE", "The request is too large.") };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail(400, "INVALID_JSON", "The request is not valid JSON.") };
  }
}

const REFUSAL_STATUS: Record<RoomErrorCode, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  NAME_TAKEN: 409,
  IDENTITY_CAP: 503,
  NOT_ORGANIZER: 403,
  ALREADY_DRAWN: 409,
  TOO_FEW_MEMBERS: 409,
  NOT_DRAWN: 409,
  CHAT_OFF: 503,
  GUEST: 403,
  WISHES_CLOSED: 409,
  NO_THREAD: 404,
  THREAD_MUTED: 409,
  RATE_LIMITED: 429,
  NOT_YOUR_MUTE: 403,
  NO_NOTES: 409,
  NOTE_CLOSED: 409,
};

/** A refusal keeps its own message. Any other error is logged on the server and tells the browser nothing. */
export function serverError(error: unknown): Response {
  if (error instanceof RoomError) {
    const fields = error.code === "NAME_TAKEN" ? { displayName: error.message } : undefined;
    return fail(REFUSAL_STATUS[error.code], error.code, error.message, fields);
  }
  if (error instanceof NexconnError) {
    console.error(error.message);
    return fail(502, "CHAT_UNAVAILABLE", "Room talk is not available now. Try again later.");
  }
  console.error(error);
  return fail(500, "SERVER_ERROR", "Something went wrong on our side. Try again.");
}
