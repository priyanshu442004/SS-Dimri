import { loadEnvConfig } from "@next/env";
import { defineConfig, env } from "prisma/config";

// Load .env / .env.local the same way Next.js does, so the CLI and the app
// share one set of environment files.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // CLI (migrate / introspect) uses Neon's DIRECT (non-pooled) connection.
    // The application runtime uses the pooled DATABASE_URL via the Neon adapter.
    url: env("DIRECT_URL"),
  },
});
