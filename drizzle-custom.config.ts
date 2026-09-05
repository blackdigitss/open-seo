import { defineConfig } from "drizzle-kit";

// Fork-owned tables only. Output lands in drizzle/custom/ with its own journal;
// alchemy's D1 migration apply walks drizzle/ recursively and orders these after
// upstream's numeric-prefixed files, so no upstream config changes.
//
//   pnpm exec drizzle-kit generate --config drizzle-custom.config.ts
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/custom/schema.ts",
  out: "./drizzle/custom",
});
