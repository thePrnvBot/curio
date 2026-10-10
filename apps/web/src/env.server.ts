import "dotenv/config";
import { z } from "zod";

export const ENV = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
  })
  .parse(process.env);
