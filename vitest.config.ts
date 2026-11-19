import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Integration tests share one test database, so test files run one after the other.
  test: { include: ["tests/**/*.test.ts"], environment: "node", fileParallelism: false },
});
