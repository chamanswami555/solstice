import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { signalRoom } from "@/lib/signal";
import { parseWishes } from "@/lib/validate";
import { saveWishes } from "@/lib/wishes";

/**
 * Replaces the caller's wish list. Safe to repeat: the same list gives the same result.
 * Status 409 after the reveal started, 403 for a guest.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseWishes(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", parsed.fields.wishes, parsed.fields);
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const wishes = await saveWishes(code, personId, parsed.value.wishes);
    // The giver's screen loads the new list. The signal names nobody and carries no wish.
    after(() => signalRoom(code));
    return Response.json({ wishes });
  } catch (error) {
    return serverError(error);
  }
}
