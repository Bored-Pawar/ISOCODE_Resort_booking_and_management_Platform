/** Optional serial profile for a remote PostgreSQL test branch with variable network latency. */
import { defineConfig } from "vitest/config";
import path from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI supplies environment variables. */
}
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 90_000,
  },
});
