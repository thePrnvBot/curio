import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "apps/web/.tanstack/**",
    "apps/web/.vinxi/**",
    "packages/db/src/schema/auth.ts",
  ],
});
