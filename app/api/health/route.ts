/** Liveness check for the host and for the uptime monitor. */
export function GET() {
  return Response.json({ status: "ok" });
}
