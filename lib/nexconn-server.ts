/** Signed calls of the Nexconn Platform Chat API. Server only: the App Secret never leaves this module. */
import { createHash, randomInt, randomUUID } from "node:crypto";
import { readConfig, type Config, type NexconnRegion } from "@/lib/config";

const API_HOSTS: Record<NexconnRegion, string> = {
  sg: "api.sg-light-api.com",
  na: "api.us-light-api.com",
  sau: "api.sau-light-api.com",
};

const TIMEOUT_MS = 5000;

/** A refused or failed call. It carries the path and the codes, never a key or a request body. */
export class NexconnError extends Error {
  constructor(
    public readonly path: string,
    public readonly code: number | null,
    public readonly status: number,
  ) {
    super(`Nexconn refused ${path}: code ${code ?? "none"}, status ${status}.`);
    this.name = "NexconnError";
  }
}

/**
 * One call. The signature is SHA-1 over the App Secret, a fresh nonce and the time in milliseconds.
 * Returns the `result` object of the answer, or an empty object when the answer has none.
 * shortcut: primary host only, add the backup host (api-b) when a time-out is seen in the logs.
 */
export async function nexconnCall<Result = Record<string, unknown>>(
  path: string,
  body: unknown,
  keys: Config["nexconn"] = readConfig().nexconn,
  send: typeof fetch = fetch,
): Promise<Result> {
  if (!keys) throw new Error("Chat is switched off: no Nexconn keys are set.");
  const nonce = String(randomInt(1_000_000_000, 1_000_000_000_000));
  const timestamp = String(Date.now());
  const response = await send(`https://${API_HOSTS[keys.region]}${path}`, {
    method: "POST",
    headers: {
      "App-Key": keys.appKey,
      Nonce: nonce,
      Timestamp: timestamp,
      Signature: createHash("sha1").update(keys.appSecret + nonce + timestamp).digest("hex"),
      "X-Request-ID": randomUUID().replaceAll("-", ""),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const answer: { code?: unknown; result?: Result } | null = await response.json().catch(() => null);
  if (!response.ok || answer?.code !== 0) {
    throw new NexconnError(path, typeof answer?.code === "number" ? answer.code : null, response.status);
  }
  return answer.result ?? ({} as Result);
}
