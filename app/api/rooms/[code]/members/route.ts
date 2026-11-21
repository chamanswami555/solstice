import { after } from "next/server";
import { currentPersonId, rememberPerson } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { mayMakePerson, TOO_MANY_PEOPLE } from "@/lib/rate";
import { signalRoom } from "@/lib/signal";
import { joinRoom } from "@/lib/rooms";
import { parseJoin } from "@/lib/validate";

/**
 * Joins the room of the invite link. A member who joins again gets the same answer and no change.
 * Status 429 when a caller with no identity cookie comes after 60 new people from its client address in one hour.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseJoin(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", "Check the marked field.", parsed.fields);

  const personId = await currentPersonId();
  try {
    if (!(await mayMakePerson(request, personId))) return fail(429, "RATE_LIMITED", TOO_MANY_PEOPLE);
    const { code } = await params;
    const joined = await joinRoom(code, parsed.value.displayName, personId);
    await rememberPerson(joined.personId);
    // The other browsers in the room load the new state. The signal goes out after the answer.
    after(() => signalRoom(code));
    return Response.json({ returnSecret: joined.returnSecret }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
