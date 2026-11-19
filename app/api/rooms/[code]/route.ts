import { fail, serverError } from "@/lib/http";
import { getRoomDoor } from "@/lib/rooms";

/** What anyone with the invite link may see before the join: the name of the room. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const { code } = await params;
    const door = /^[A-Z0-9]{6,12}$/.test(code) ? await getRoomDoor(code) : null;
    if (!door) return fail(404, "ROOM_NOT_FOUND", "This room does not exist.");
    return Response.json({ room: door }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
