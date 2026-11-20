import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { openRoomTalk } from "@/lib/room-talk";

/**
 * Gives a member of the room the access token for room talk. Safe to repeat.
 * Status 503 when chat is switched off, 502 when the chat service refuses.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    return Response.json({ talk: await openRoomTalk(code, personId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
