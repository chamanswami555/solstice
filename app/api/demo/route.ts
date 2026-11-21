import { currentPersonId, rememberPerson } from "@/lib/current-person";
import { startDemoRoom } from "@/lib/demo";
import { fail, readJson, serverError } from "@/lib/http";
import { mayMakePerson, mayMakeRoom, TOO_MANY_PEOPLE, TOO_MANY_ROOMS } from "@/lib/rate";

/**
 * Starts the caller's demo room: one visitor and three members that the website plays.
 * A second request starts again: it removes the caller's old demo room and makes a new one.
 * It counts as a new room for the limit of 10 rooms from one client address in one hour, and a
 * caller with no identity cookie counts for the limit of 60 new people from it.
 */
export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;

  // The cookie is read outside the try block: the framework signals a per-request route with a throw.
  const personId = await currentPersonId();
  try {
    if (!(await mayMakeRoom(request))) return fail(429, "RATE_LIMITED", TOO_MANY_ROOMS);
    if (!(await mayMakePerson(request, personId))) return fail(429, "RATE_LIMITED", TOO_MANY_PEOPLE);
    const demo = await startDemoRoom(personId);
    await rememberPerson(demo.personId);
    return Response.json({ room: { code: demo.code }, returnSecret: demo.returnSecret }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
