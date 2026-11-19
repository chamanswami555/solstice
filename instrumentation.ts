/** Runs one time when the server starts. The check itself needs Node.js, so it lives in its own file. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
