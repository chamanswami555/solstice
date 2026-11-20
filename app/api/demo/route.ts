import { currentPersonId, rememberPerson } from "@/lib/current-person";
import { startDemoRoom } from "@/lib/demo";
import { readJson, serverError } from "@/lib/http";

/**
 * Starts the caller's demo room: one visitor and three members that the website plays.
 * A second request starts again: it removes the caller's old demo room and makes a new one.
 */
export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;

  // The cookie is read outside the try block: the framework signals a per-request route with a throw.
  const personId = await currentPersonId();
  try {
    const demo = await startDemoRoom(personId);
    await rememberPerson(demo.personId);
    return Response.json({ room: { code: demo.code }, returnSecret: demo.returnSecret }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
