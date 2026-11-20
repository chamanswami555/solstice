import { connection } from "next/server";
import { serverError } from "@/lib/http";
import { getUsage } from "@/lib/usage";

/** The public usage numbers: counts only, no name and no text. Read from the database at each request. */
export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json({ usage: await getUsage() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
