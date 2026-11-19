import { currentPersonId, rememberPerson } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { joinRoom } from "@/lib/rooms";
import { parseJoin } from "@/lib/validate";

/** Joins the room of the invite link. A member who joins again gets the same answer and no change. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseJoin(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", "Check the marked field.", parsed.fields);

  const personId = await currentPersonId();
  try {
    const { code } = await params;
    const joined = await joinRoom(code, parsed.value.displayName, personId);
    await rememberPerson(joined.personId);
    return Response.json({ returnSecret: joined.returnSecret }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
