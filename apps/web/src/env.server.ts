import "dotenv/config";
import { normalizeArtifactServerMcpUrl } from "@curio/api/infrastructure/mcp-artifact-publisher";
import { z } from "zod";

export const ENV = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    AI_BASE_URL: z.string().url(),
    AI_API_KEY: z.string().min(1),
    AI_MODEL: z.string().min(1),
    AI_PROTOCOL: z
      .enum(["chat-completions", "responses"])
      .default("chat-completions"),
    MODEL_SETTINGS_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .optional()
      .transform((value) => value ?? undefined),
    ARTIFACT_SERVER_URL: z
      .union([z.string().url(), z.literal("")])
      .transform((value) =>
        value === "" ? undefined : normalizeArtifactServerMcpUrl(value)
      ),
    ARTIFACT_SERVER_API_KEY: z
      .string()
      .min(1)
      .optional()
      .transform((value) => value ?? undefined),
  })
  .parse(process.env);
