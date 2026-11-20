import { currentPersonId } from "@/lib/current-person";
import { fail, readJson, serverError } from "@/lib/http";
import { revealNext } from "@/lib/reveal";
import { parseReveal } from "@/lib/validate";

/**
 * The organizer shows the next pair. The body carries the step on the organizer's screen.
 * Safe to retry: a request for a pair that is already shown moves nothing and answers with the current step.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = parseReveal(read.body);
  if (!parsed.ok) return fail(422, "VALIDATION_ERROR", "Send the step that your screen shows.", parsed.fields);
  const personId = await currentPersonId();
  if (!personId) return fail(401, "NO_IDENTITY", "Open your invite link or your return link.");

  try {
    const { code } = await params;
    return Response.json({ reveal: await revealNext(code, personId, parsed.value.step) });
  } catch (error) {
    return serverError(error);
  }
}
