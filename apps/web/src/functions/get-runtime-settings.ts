import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";
import { ENV } from "@/env.server";

export interface RuntimeSettingsView {
  readonly model: string;
  readonly protocol: "chat-completions" | "responses";
  readonly providerHost: string;
  readonly artifactPublishing: boolean;
}

/** Non-secret runtime settings for the dashboard; the API key never leaves
 * the server. */
export const getRuntimeSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler((): RuntimeSettingsView => ({
    model: ENV.AI_MODEL,
    protocol: ENV.AI_PROTOCOL,
    providerHost: new URL(ENV.AI_BASE_URL).host,
    artifactPublishing: ENV.ARTIFACT_SERVER_URL !== undefined,
  }));
