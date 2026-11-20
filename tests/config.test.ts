import { describe, expect, it } from "vitest";
import { ConfigError, readConfig } from "@/lib/config";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app:pw@db.internal:5432/solstice",
  SESSION_SECRET: "k3Jq9vXw2LmN8pRt5YbZ1cDf7GhS4aUe",
  NEXCONN_APP_KEY: "abc123def456",
  NEXCONN_APP_SECRET: "s3cr3tValue9876543210",
  NEXCONN_REGION: "sg",
};

describe("readConfig", () => {
  it("returns the settings when every value is present", () => {
    const config = readConfig(valid);

    expect(config.databaseUrl).toBe(valid.DATABASE_URL);
    expect(config.nexconn).toEqual({ appKey: "abc123def456", appSecret: "s3cr3tValue9876543210", region: "sg" });
  });

  it("names every missing value in one error", () => {
    const act = () => readConfig({ NODE_ENV: "production" });

    expect(act).toThrow(ConfigError);
    expect(act).toThrow(/DATABASE_URL.*SESSION_SECRET.*NEXCONN_APP_KEY.*NEXCONN_APP_SECRET.*NEXCONN_REGION/);
  });

  it("refuses a placeholder secret", () => {
    const act = () => readConfig({ ...valid, SESSION_SECRET: "replace-with-a-long-random-value-0000" });

    expect(act).toThrow(/SESSION_SECRET is a placeholder/);
  });

  it("refuses a session secret shorter than 32 characters", () => {
    const act = () => readConfig({ ...valid, SESSION_SECRET: "tooShort123" });

    expect(act).toThrow(/SESSION_SECRET must have 32 characters or more/);
  });

  it("refuses a region that Nexconn does not have", () => {
    const act = () => readConfig({ ...valid, NEXCONN_REGION: "mars" });

    expect(act).toThrow(/NEXCONN_REGION must be one of sg, na, sau/);
  });

  it("refuses production without the Nexconn keys", () => {
    const withoutKeys = {
      NODE_ENV: "production",
      DATABASE_URL: valid.DATABASE_URL,
      SESSION_SECRET: valid.SESSION_SECRET,
    };

    expect(() => readConfig(withoutKeys)).toThrow(/NEXCONN_APP_KEY/);
  });

  it("starts in production with chat switched off when CHAT=off is set", () => {
    const config = readConfig({
      NODE_ENV: "production",
      DATABASE_URL: valid.DATABASE_URL,
      SESSION_SECRET: valid.SESSION_SECRET,
      CHAT: "off",
    });

    expect(config.nexconn).toBeNull();
  });

  it("refuses a CHAT value that is not off", () => {
    const act = () => readConfig({ ...valid, CHAT: "on" });

    expect(act).toThrow(/CHAT must be "off" or not set/);
  });

  it("refuses CHAT=off together with Nexconn keys", () => {
    const act = () => readConfig({ ...valid, CHAT: "off" });

    expect(act).toThrow(/CHAT=off and Nexconn keys are both set/);
  });

  it("starts in development without the Nexconn keys, with chat switched off", () => {
    const config = readConfig({
      NODE_ENV: "development",
      DATABASE_URL: valid.DATABASE_URL,
      SESSION_SECRET: valid.SESSION_SECRET,
    });

    expect(config.nexconn).toBeNull();
  });
});
