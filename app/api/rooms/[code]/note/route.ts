import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { saveNote } from "@/lib/notes";
import { signalRoom } from "@/lib/signal";
import { parseNote } from "@/lib/validate";

/**
 * Saves the caller's gift note of a tonight round. An empty text takes the note away. Safe to repeat.
 * Status 409 in a December room, before the draw, and after the caller's pair is revealed.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseNote(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", parsed.fields.text, parsed.fields);
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const note = await saveNote(code, personId, parsed.value.text);
    // The organizer's count of notes moves. The signal carries no note and names nobody.
    after(() => signalRoom(code));
    return Response.json({ note });
  } catch (error) {
    return serverError(error);
  }
}
