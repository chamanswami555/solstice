import { currentPersonId } from "@/lib/current-person";
import { fail, serverError } from "@/lib/http";
import { getRoomState } from "@/lib/rooms";

/** Everything the caller may see of the room. A person outside the room gets the same answer as for no room. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    const state = /^[A-Z0-9]{6,12}$/.test(code) ? await getRoomState(code, personId) : null;
    if (!state) return fail(404, "ROOM_NOT_FOUND", "This room does not exist, or you are not in it.");
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
