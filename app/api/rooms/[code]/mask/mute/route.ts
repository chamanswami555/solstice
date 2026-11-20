import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { setMaskMute } from "@/lib/mask";
import { signalPerson } from "@/lib/signal";
import { parseMaskMute } from "@/lib/validate";

/**
 * Mutes one of the caller's mask threads, or takes the caller's own mute off. Safe to repeat.
 * Status 403 when the other person muted the thread.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseMaskMute(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", Object.values(parsed.fields)[0], parsed.fields);
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const changed = await setMaskMute(code, personId, parsed.value.side, parsed.value.muted);
    const other = changed.otherPersonId;
    if (other) after(() => signalPerson(code, other));
    return Response.json({ thread: changed.thread });
  } catch (error) {
    return serverError(error);
  }
}
