/** Server settings, read once from the environment. The server refuses to start on a bad value. */

export const NEXCONN_REGIONS = ["sg", "na", "sau"] as const;
export type NexconnRegion = (typeof NEXCONN_REGIONS)[number];

export type Config = {
  databaseUrl: string;
  sessionSecret: string;
  /** Null when chat is switched off: by CHAT=off, or outside production when the keys are not set. */
  nexconn: { appKey: string; appSecret: string; region: NexconnRegion } | null;
};

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`The server cannot start. ${problems.join(" ")} Set the values in .env.local (see .env.example).`);
    this.name = "ConfigError";
  }
}

const PLACEHOLDER = /^(replace-|changeme|your-|<)/i;
const NEXCONN_KEYS = ["NEXCONN_APP_KEY", "NEXCONN_APP_SECRET", "NEXCONN_REGION"] as const;

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const value = (name: string) => env[name]?.trim() ?? "";
  const chat = value("CHAT");
  const keysSet = NEXCONN_KEYS.some((name) => value(name) !== "");
  // Production runs without chat only on an explicit order, never because a key is missing.
  const nexconnWanted = chat !== "off" && (env.NODE_ENV === "production" || keysSet);
  const required = ["DATABASE_URL", "SESSION_SECRET", ...(nexconnWanted ? NEXCONN_KEYS : [])];

  const missing = required.filter((name) => value(name) === "");
  const problems: string[] = [];
  if (chat !== "" && chat !== "off") problems.push('CHAT must be "off" or not set.');
  if (chat === "off" && keysSet) problems.push("CHAT=off and Nexconn keys are both set. Remove one of the two.");
  if (missing.length > 0) problems.push(`Missing: ${missing.join(", ")}.`);
  for (const name of required) {
    if (PLACEHOLDER.test(value(name))) problems.push(`${name} is a placeholder.`);
  }
  const secret = value("SESSION_SECRET");
  if (secret !== "" && !PLACEHOLDER.test(secret) && secret.length < 32) {
    problems.push("SESSION_SECRET must have 32 characters or more.");
  }
  const region = value("NEXCONN_REGION");
  if (region !== "" && !NEXCONN_REGIONS.includes(region as NexconnRegion)) {
    problems.push(`NEXCONN_REGION must be one of ${NEXCONN_REGIONS.join(", ")}.`);
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    databaseUrl: value("DATABASE_URL"),
    sessionSecret: secret,
    nexconn: nexconnWanted
      ? { appKey: value("NEXCONN_APP_KEY"), appSecret: value("NEXCONN_APP_SECRET"), region: region as NexconnRegion }
      : null,
  };
}
