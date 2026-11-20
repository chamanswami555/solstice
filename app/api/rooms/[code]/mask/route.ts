import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { getMaskThreads, postMaskMessage } from "@/lib/mask";
import { signalPerson } from "@/lib/signal";
import { parseMaskMessage } from "@/lib/validate";

type RouteContext = { params: Promise<{ code: string }> };

/** The caller's two mask threads. Before the full reveal, nothing in the answer names a secret giver. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const threads = /^[A-Z0-9]{6,12}$/.test(code) ? await getMaskThreads(code, personId) : null;
    if (!threads) return fail(404, "ROOM_NOT_FOUND", "This room does not exist, or you are not in it.");
    return Response.json({ threads }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Stores one mask message of the caller. Not safe to repeat: a second request stores a second message.
 * Status 409 for a muted thread, 429 over the rate limit, 404 with no thread on that side.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseMaskMessage(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", Object.values(parsed.fields)[0], parsed.fields);
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const posted = await postMaskMessage(code, personId, parsed.value.side, parsed.value.text);
    // Only the other person of the pair gets the signal. It carries no text, no sender and no thread.
    after(() => signalPerson(code, posted.otherPersonId));
    return Response.json({ thread: posted.thread }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
