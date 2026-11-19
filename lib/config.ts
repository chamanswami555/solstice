/** Server settings, read once from the environment. The server refuses to start on a bad value. */

export const NEXCONN_REGIONS = ["sg", "na", "sau"] as const;
export type NexconnRegion = (typeof NEXCONN_REGIONS)[number];

export type Config = {
  databaseUrl: string;
  sessionSecret: string;
  /** Null only outside production, when the keys are not set. Chat is then switched off. */
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
  const nexconnWanted = env.NODE_ENV === "production" || NEXCONN_KEYS.some((name) => value(name) !== "");
  const required = ["DATABASE_URL", "SESSION_SECRET", ...(nexconnWanted ? NEXCONN_KEYS : [])];

  const missing = required.filter((name) => value(name) === "");
  const problems: string[] = [];
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
