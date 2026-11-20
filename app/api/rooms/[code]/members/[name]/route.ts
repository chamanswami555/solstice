import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { closeRoomTalk } from "@/lib/room-talk";
import { removeMember } from "@/lib/rooms";
import { signalRoom } from "@/lib/signal";

/**
 * The organizer removes the member with this display name, before the draw. The person cannot
 * join the room again. A second request answers 404: the member is gone.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ code: string; name: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code, name } = await params;
    const displayName = decodeURIComponent(name).trim();
    if (displayName === "" || displayName.length > LIMITS.displayNameMax) return fail(404, "MEMBER_NOT_FOUND", "No member with this name is in the room.");
    const removed = await removeMember(code, personId, displayName);
    after(async () => {
      await closeRoomTalk(code, removed);
      await signalRoom(code);
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return serverError(error);
  }
}
