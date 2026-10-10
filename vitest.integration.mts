import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs service-level flows against a real PostgreSQL (DATABASE_URL from .env).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", setupFiles: ["tests/integration/setup.ts"], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
});
