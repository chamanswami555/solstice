import { currentPersonId, rememberPerson } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { mayMakePerson, mayMakeRoom, TOO_MANY_PEOPLE, TOO_MANY_ROOMS } from "@/lib/rate";
import { createRoom } from "@/lib/rooms";
import { parseCreateRoom } from "@/lib/validate";

/**
 * Creates a room. The caller becomes its organizer and first member.
 * Not safe to retry: a second request makes a second room.
 * Status 429 after 10 rooms from one client address in one hour, or after 60 new people from it.
 */
export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseCreateRoom(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", "Check the marked fields.", parsed.fields);

  // The cookie is read outside the try block: the framework signals a per-request route with a throw.
  const personId = await currentPersonId();
  try {
    if (!(await mayMakeRoom(request))) return fail(429, "RATE_LIMITED", TOO_MANY_ROOMS);
    if (!(await mayMakePerson(request, personId))) return fail(429, "RATE_LIMITED", TOO_MANY_PEOPLE);
    const created = await createRoom(parsed.value, personId);
    await rememberPerson(created.personId);
    return Response.json({ room: { code: created.code }, returnSecret: created.returnSecret }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
