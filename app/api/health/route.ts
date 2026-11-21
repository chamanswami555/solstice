import { connection } from "next/server";
import { getPool } from "@/lib/db";

/** Health check for the host and the uptime monitor: 200 when the server and the database answer, 503 when the database does not. */
export async function GET(): Promise<Response> {
  await connection();
  try {
    await getPool().query("select 1");
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Health check: the database did not answer:", error instanceof Error ? error.message : error);
    return Response.json({ status: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
