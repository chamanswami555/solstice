/** Runs one time when the server starts. A bad setting stops the process with a plain message. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { readConfig } = await import("./lib/config");
  try {
    readConfig();
  } catch (error) {
    // Without the exit, the server stays up and answers every request with status 500.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
