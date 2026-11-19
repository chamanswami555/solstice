/** One shape for every error answer, and one safe way to read a JSON body. */
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

/** Logs the cause on the server and tells the browser nothing about it. */
export function serverError(error: unknown): Response {
  console.error(error);
  return fail(500, "SERVER_ERROR", "Something went wrong on our side. Try again.");
}
