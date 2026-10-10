import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: fileURLToPath(new URL("../../apps/web/.env", import.meta.url)),
});

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
  })
  .parse(process.env);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
