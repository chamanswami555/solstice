import { defineConfig } from "@playwright/test";

const port = 3412;
/** Signs the identity cookie of the test server only. A test may sign a cookie with it. */
export const E2E_SESSION_SECRET = "e2e-only-secret-not-used-anywhere-else-0001";

// With E2E_BASE_URL the run goes against a public URL. Only the checks that write nothing run
// there: no local server, no database reset, no test rooms.
const liveUrl = process.env.E2E_BASE_URL;
// With NEXCONN_SMOKE=1 the server gets the real chat keys and only the room talk test runs
// (`npm run test:e2e:talk`). Every other run has chat switched off and calls no chat service.
const realChat = process.env.NEXCONN_SMOKE === "1";
const TALK_SPEC = "room-talk.spec.ts";

// The browser tests run against the production build and the test database.
export default defineConfig({
  testDir: "e2e",
  testMatch: liveUrl ? "live.spec.ts" : realChat ? TALK_SPEC : "*.spec.ts",
  testIgnore: realChat ? [] : [TALK_SPEC],
  globalSetup: liveUrl ? undefined : "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: liveUrl || `http://localhost:${port}` },
  webServer: liveUrl
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port}`,
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          NEXT_TELEMETRY_DISABLED: "1",
          // Browser tests never write to the development database.
          DATABASE_URL: process.env.TEST_DATABASE_URL || "postgres://localhost:5432/solstice_test",
          SESSION_SECRET: E2E_SESSION_SECRET,
          CHAT: realChat ? "" : "off",
          NEXCONN_APP_KEY: realChat ? (process.env.NEXCONN_APP_KEY ?? "") : "",
          NEXCONN_APP_SECRET: realChat ? (process.env.NEXCONN_APP_SECRET ?? "") : "",
          NEXCONN_REGION: realChat ? (process.env.NEXCONN_REGION ?? "") : "",
        },
      },
});
