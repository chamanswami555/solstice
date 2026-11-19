import { rememberPerson } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { findPersonByReturnSecret } from "@/lib/people";

/** Opens the identity of a return link in this browser. */
export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const secret = (read.body as { returnSecret?: unknown } | null)?.returnSecret;
  if (typeof secret !== "string" || secret.length < 20 || secret.length > 100) {
    return fail(422, "VALIDATION_ERROR", "This return link is not complete.");
  }

  try {
    const personId = await findPersonByReturnSecret(secret);
    if (!personId) return fail(404, "RETURN_LINK_UNKNOWN", "This return link does not work.");
    await rememberPerson(personId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return serverError(error);
  }
}
