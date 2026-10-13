import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Effect, Option } from "effect";
import { z } from "zod";

import type {
  ArtifactPublicationInput,
  ArtifactPublicationResult,
} from "../domain/artifact";
import { ArtifactPublishFailed } from "../domain/artifact-publish-failed";
import type { ArtifactPublisherContract } from "../services/artifact-publisher";

export interface ArtifactServerMcpConfig {
  /** Full URL of the Artifact Server MCP endpoint, e.g. http://127.0.0.1:8787/mcp */
  readonly mcpUrl: string;
  /** Optional bearer API key; also reused for opaque upload URLs. */
  readonly apiKey?: string;
  /** Project the agent publishes into; created on demand. */
  readonly projectName: string;
}

/**
 * Wire contracts below mirror the artifact-server MCP tool schemas
 * (src/mcp/artifact-mcp-server.ts). Everything crossing the MCP boundary is
 * untrusted JSON, so it is parsed with zod at the adapter boundary — schema
 * drift degrades into typed publish failures instead of `unknown` leaking
 * deeper into the pipeline.
 */

const mcpTextBlockSchema = z.object({
  text: z.string().optional(),
  type: z.string(),
});

const mcpToolResultSchema = z.object({
  content: z.array(mcpTextBlockSchema).optional(),
  isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
});

const projectProjectionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().optional(),
  projectId: z.string().min(1).optional(),
});

const projectListResultSchema = z.object({
  projects: z.array(projectProjectionSchema).optional(),
});

const projectCreateResultSchema = z.object({
  id: z.string().min(1).optional(),
  project: projectProjectionSchema.optional(),
  projectId: z.string().min(1).optional(),
});

const stagedFileSchema = z.object({
  method: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  uploadUrl: z.string().min(1).optional(),
});

const stagedUploadResultSchema = z.object({
  commit: z.object({ uploadId: z.string().min(1).optional() }).optional(),
  files: z.array(stagedFileSchema).optional(),
  uploadId: z.string().min(1).optional(),
});

const commitLinksSchema = z.object({
  artifact: z.string().min(1).optional(),
  review: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

const commitResultSchema = z.object({
  artifact: z.object({ id: z.string().min(1).optional() }).optional(),
  links: commitLinksSchema.optional(),
  version: z.object({ id: z.string().min(1).optional() }).optional(),
});

function toMcpError(
  operationTitle: string
): (cause: unknown) => ArtifactPublishFailed {
  return (cause: unknown) =>
    new ArtifactPublishFailed({ cause, title: operationTitle });
}

/** Collapses an MCP `callTool` envelope into the structured result record: a
 * protocol error becomes a typed publish failure, and a text-serialized JSON
 * body (a common MCP fallback) is parsed before the underlying record is
 * returned for schema validation. */
function unwrapToolResultRecord(
  rawToolOutput: unknown,
  toolName: string
): Record<string, unknown> {
  const asFailure = (text: string): Error =>
    new ArtifactPublishFailed({ cause: text, title: toolName });

  const parsedEnvelope = mcpToolResultSchema.safeParse(rawToolOutput);
  if (!parsedEnvelope.success) {
    throw asFailure("unexpected MCP result shape");
  }
  if (parsedEnvelope.data.isError === true) {
    const errorText = parsedEnvelope.data.content
      ?.filter((block) => block.type === "text" && block.text !== undefined)
      .map((block) => block.text)
      .at(0);
    throw asFailure(errorText ?? "MCP tool reported an error");
  }
  if (parsedEnvelope.data.structuredContent !== undefined) {
    return parsedEnvelope.data.structuredContent;
  }
  const firstTextBlock = parsedEnvelope.data.content
    ?.filter((block) => block.type === "text" && block.text !== undefined)
    .at(0);
  if (firstTextBlock?.text !== undefined) {
    try {
      const parsedText: unknown = JSON.parse(firstTextBlock.text);
      const recordCheck = z
        .record(z.string(), z.unknown())
        .safeParse(parsedText);
      if (recordCheck.success) {
        return recordCheck.data;
      }
    } catch {
      throw asFailure(firstTextBlock.text);
    }
  }
  if (
    Array.isArray(parsedEnvelope.data.content) &&
    parsedEnvelope.data.content.length === 0
  ) {
    return {};
  }
  throw asFailure("unexpected MCP result shape");
}

function callArtifactTool<T>(
  client: Client,
  toolName: string,
  toolArguments: Record<string, unknown>,
  resultSchema: z.ZodType<T>
): Effect.Effect<T, ArtifactPublishFailed> {
  return Effect.tryPromise({
    catch: toMcpError(toolName),
    try: () => client.callTool({ arguments: toolArguments, name: toolName }),
  }).pipe(
    Effect.flatMap((rawToolOutput) =>
      Effect.try({
        catch: toMcpError(toolName),
        try: () => unwrapToolResultRecord(rawToolOutput, toolName),
      })
    ),
    Effect.flatMap((resultRecord) => {
      const parsedResult = resultSchema.safeParse(resultRecord);
      if (parsedResult.success) {
        return Effect.succeed(parsedResult.data);
      }
      return Effect.fail(
        new ArtifactPublishFailed({
          cause: parsedResult.error.message,
          title: toolName,
        })
      );
    })
  );
}

function requireValue<T>(
  value: T | undefined,
  missingTitle: string
): Effect.Effect<T, ArtifactPublishFailed> {
  return Option.match(Option.fromNullishOr(value), {
    onNone: () =>
      Effect.fail(
        new ArtifactPublishFailed({
          cause: "missing value",
          title: missingTitle,
        })
      ),
    onSome: Effect.succeed,
  });
}

function connectArtifactServerMcp(
  config: ArtifactServerMcpConfig
): Effect.Effect<Client, ArtifactPublishFailed> {
  return Effect.tryPromise({
    catch: toMcpError("MCP connect"),
    try: async () => {
      const mcpClient = new Client({ name: "curio", version: "0.1.0" });
      await mcpClient.connect(
        new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
          requestInit: {
            headers: config.apiKey
              ? { Authorization: `Bearer ${config.apiKey}` }
              : undefined,
          },
        })
      );
      return mcpClient;
    },
  });
}

interface ProjectProjectionView {
  readonly id?: string;
  readonly projectId?: string;
}

function readProjectId(
  projection: ProjectProjectionView
): Effect.Effect<string, ArtifactPublishFailed> {
  return requireValue(
    projection.id ?? projection.projectId,
    "project call returned no project id"
  );
}

function resolveProjectId(
  client: Client,
  config: ArtifactServerMcpConfig
): Effect.Effect<string, ArtifactPublishFailed> {
  return callArtifactTool(
    client,
    "project_list",
    {},
    projectListResultSchema
  ).pipe(
    Effect.flatMap((listResult) => {
      const matchingProject = (listResult.projects ?? []).find(
        (project) =>
          project.name !== undefined && project.name === config.projectName
      );
      if (matchingProject !== undefined) {
        return readProjectId(matchingProject);
      }
      return callArtifactTool(
        client,
        "project_create",
        { name: config.projectName },
        projectCreateResultSchema
      ).pipe(Effect.flatMap(readProjectId));
    })
  );
}

function stageArtifactUpload(
  client: Client,
  projectId: string,
  input: ArtifactPublicationInput,
  fingerprintSha256: string,
  byteLength: number
): Effect.Effect<
  { stagedEntry: { method?: string; uploadUrl?: string }; stagedUploadId: string },
  ArtifactPublishFailed
> {
  return callArtifactTool(
    client,
    "artifact_create_upload",
    {
      entryPath: input.entryFilename,
      files: [
        {
          mediaType: input.mediaType,
          path: input.entryFilename,
          sha256: fingerprintSha256,
          size: byteLength,
        },
      ],
      projectId,
      routingMode: "static",
    },
    stagedUploadResultSchema
  ).pipe(
    Effect.flatMap((createResult) => {
      const stagedEntry = (createResult.files ?? []).find(
        (fileEntry) => fileEntry.path === input.entryFilename
      );
      const stagedUploadId =
        createResult.uploadId ?? createResult.commit?.uploadId;
      return Effect.gen(function* stageUpload() {
        const resolvedEntry = yield* requireValue(
          stagedEntry,
          "artifact_create_upload returned no file instructions"
        );
        const uploadId = yield* requireValue(
          stagedUploadId,
          "artifact_create_upload returned no upload id"
        );
        return { stagedEntry: resolvedEntry, stagedUploadId: uploadId };
      });
    })
  );
}

function uploadStagedEntryBytes(
  stagedEntry: { method?: string; uploadUrl?: string },
  config: ArtifactServerMcpConfig,
  input: ArtifactPublicationInput
): Effect.Effect<void, ArtifactPublishFailed> {
  return Effect.gen(function* uploadEntry() {
    const uploadUrl = yield* requireValue(
      stagedEntry.uploadUrl,
      "upload stage returned no upload URL"
    );
    const uploadMethod = stagedEntry.method ?? "PUT";
    // The upload plan's authorization instructs reuse of the MCP bearer
    // credential for the opaque upload URL.
    yield* Effect.tryPromise({
      catch: toMcpError("upload bytes"),
      try: async () => {
        const uploadHeaders: Record<string, string> = {
          "Content-Type": input.mediaType,
        };
        if (config.apiKey !== undefined) {
          uploadHeaders.Authorization = `Bearer ${config.apiKey}`;
        }
        const uploadResponse = await fetch(uploadUrl, {
          body: input.content,
          headers: uploadHeaders,
          method: uploadMethod,
        });
        if (!uploadResponse.ok) {
          throw new Error(
            `Upload responded ${uploadResponse.status} ${uploadResponse.statusText}`
          );
        }
      },
    });
  });
}

function commitArtifactUpload(
  client: Client,
  stagedUploadId: string,
  projectId: string,
  input: ArtifactPublicationInput,
  fingerprintSha256: string,
  byteLength: number
): Effect.Effect<ArtifactPublicationResult, ArtifactPublishFailed> {
  void fingerprintSha256;
  void byteLength;
  return callArtifactTool(
    client,
    "artifact_commit_upload",
    {
      idempotencyKey: crypto.randomUUID(),
      projectId,
      target: {
        kind: "new_artifact",
        name: input.title,
        tags: [],
      },
      uploadId: stagedUploadId,
    },
    commitResultSchema
  ).pipe(
    Effect.flatMap((commitResult) => {
      const ties = commitResult.links ?? {};
      return Effect.map(
        requireValue(
          ties.review,
          "artifact_commit_upload returned no review link"
        ),
        (resolvedReviewLink) => ({
          artifactId: commitResult.artifact?.id ?? "",
          links: {
            artifact: ties.artifact ?? "",
            review: resolvedReviewLink,
            version: ties.version ?? "",
          },
          versionId: commitResult.version?.id ?? "",
        })
      );
    })
  );
}

/**
 * Transport adapter for an Artifact Server installation's MCP endpoint.
 *
 * Everything provider-specific — MCP protocol, tool/field spellings, staged
 * upload handling — lives in this one adapter. Domain code only sees the
 * ArtifactPublisherContract with typed inputs and outputs.
 */
export function createMcpArtifactPublisher(
  config: ArtifactServerMcpConfig
): ArtifactPublisherContract {
  return {
    publish: (input: ArtifactPublicationInput) =>
      Effect.gen(function* publishArtifact() {
        const mcpClient = yield* connectArtifactServerMcp(config);
        const contentBytes = Buffer.from(input.content, "utf-8");
        const fingerprintSha256 = createHash("sha256")
          .update(contentBytes)
          .digest("hex");

        const projectId = yield* resolveProjectId(mcpClient, config);
        const { stagedEntry, stagedUploadId } = yield* stageArtifactUpload(
          mcpClient,
          projectId,
          input,
          fingerprintSha256,
          contentBytes.byteLength
        );
        yield* uploadStagedEntryBytes(stagedEntry, config, input);
        const publicationResult = yield* commitArtifactUpload(
          mcpClient,
          stagedUploadId,
          projectId,
          input,
          fingerprintSha256,
          contentBytes.byteLength
        );

        yield* Effect.ignore(Effect.promise(() => mcpClient.close()));
        return publicationResult;
      }),
  };
}
