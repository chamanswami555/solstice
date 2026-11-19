import { readConfig } from "./lib/config";

// A bad setting stops the process with a plain message.
// Without the exit, the server stays up and answers every request with status 500.
try {
  readConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
