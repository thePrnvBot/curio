import { validateUIMessages } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";

const artifactDataSchema = z.object({
  content: z.string(),
  mediaType: z.string(),
  reviewUrl: z.string().url().optional(),
  summary: z.string().optional(),
  title: z.string().optional(),
});

/**
 * Rebuilds engine-typed UI messages from persisted message records.
 *
 * Persistence stores message parts as opaque JSON, so client code must
 * re-validate through the AI SDK boundary instead of trusting the shape.
 * Custom data parts are registered so inline artifact cards survive reloads.
 */
export async function restoreUIMessages(
  candidateMessages: readonly {
    readonly id: string;
    readonly role: string;
    readonly parts: unknown;
  }[]
): Promise<UIMessage[]> {
  const restoredMessages = await validateUIMessages({
    dataSchemas: { artifact: artifactDataSchema },
    messages: candidateMessages.map((candidateMessage) => ({
      id: candidateMessage.id,
      parts: candidateMessage.parts,
      role: candidateMessage.role,
    })),
  });

  return restoredMessages;
}

/** Typed shape of the `data-artifact` UI part payload. */
export interface ArtifactUIData {
  readonly content: string;
  readonly mediaType: string;
  readonly reviewUrl?: string;
  readonly summary?: string;
  readonly title?: string;
}
