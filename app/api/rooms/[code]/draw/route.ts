import { after } from "next/server";
import { currentPersonId } from "@/lib/current-person";
import { drawRoom } from "@/lib/draw";
import { fail, readJson, serverError } from "@/lib/http";
import { signalRoom } from "@/lib/signal";

/** The organizer draws the names. A room has one draw: a second request gets status 409. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    await drawRoom(code, personId);
    // The other browsers in the room load the new state. The signal goes out after the answer.
    after(() => signalRoom(code));
    return Response.json({ drawn: true }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
