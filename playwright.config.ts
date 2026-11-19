import { defineConfig } from "@playwright/test";

const port = 3412;

// The browser tests run against the production build. Screens that need no chat run with
// stand-in chat keys; tests that connect to Nexconn read the real keys from the environment.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      // Browser tests never write to the development database.
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgres://localhost:5432/solstice_test",
      SESSION_SECRET: "e2e-only-secret-not-used-anywhere-else-0001",
      NEXCONN_APP_KEY: process.env.NEXCONN_APP_KEY || "e2e-chat-off-key",
      NEXCONN_APP_SECRET: process.env.NEXCONN_APP_SECRET || "e2e-chat-off-secret",
      NEXCONN_REGION: process.env.NEXCONN_REGION || "sg",
    },
  },
});
