import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Effect, Option } from "effect";

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
 * (src/mcp/artifact-mcp-server.ts). Provider payloads are still read
 * defensively via helpers so minor schema drift degrades gracefully.
 */
type ProviderRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ProviderRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: ProviderRecord,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function recordArrayFromKeys(
  record: ProviderRecord,
  keys: string[]
): readonly ProviderRecord[] {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return Array.isArray(record[key])
        ? (record[key] as unknown[]).filter(isRecord)
        : [];
    }
  }
  return [];
}

function toMcpError(
  operationTitle: string
): (cause: unknown) => ArtifactPublishFailed {
  return (cause: unknown) =>
    new ArtifactPublishFailed({ cause, title: operationTitle });
}

function unwrapStructuredToolResult(
  rawToolOutput: unknown,
  toolName: string
): ProviderRecord {
  const asFailure = (text: string): ArtifactPublishFailed =>
    new ArtifactPublishFailed({ cause: text, title: toolName });

  if (!isRecord(rawToolOutput)) {
    throw asFailure("unexpected MCP result shape");
  }
  if (rawToolOutput.isError === true) {
    const errorTextBlock = recordArrayFromKeys(rawToolOutput, ["content"]).find(
      (block) => block.type === "text" && typeof block.text === "string"
    );
    throw asFailure(
      typeof errorTextBlock?.text === "string"
        ? errorTextBlock.text
        : "MCP tool reported an error"
    );
  }
  if (isRecord(rawToolOutput.structuredContent)) {
    return rawToolOutput.structuredContent;
  }
  const firstTextBlock = recordArrayFromKeys(rawToolOutput, ["content"]).find(
    (block) => block.type === "text" && typeof block.text === "string"
  );
  if (firstTextBlock && typeof firstTextBlock.text === "string") {
    try {
      const parsedText: unknown = JSON.parse(firstTextBlock.text);
      if (isRecord(parsedText)) {
        return parsedText;
      }
    } catch {
      throw asFailure(firstTextBlock.text);
    }
  }
  if (
    Array.isArray(rawToolOutput.content) &&
    rawToolOutput.content.length === 0
  ) {
    return {};
  }
  throw asFailure("unexpected MCP result shape");
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

function callArtifactTool(
  client: Client,
  toolName: string,
  toolArguments: ProviderRecord
): Effect.Effect<ProviderRecord, ArtifactPublishFailed> {
  return Effect.tryPromise({
    catch: toMcpError(toolName),
    try: () => client.callTool({ arguments: toolArguments, name: toolName }),
  }).pipe(Effect.map((raw) => unwrapStructuredToolResult(raw, toolName)));
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

function readProjectId(
  outcome: ProviderRecord
): Effect.Effect<string, ArtifactPublishFailed> {
  // project_create wraps the projection: { project: {...} }; project_list
  // items are flat projections.
  const projection = isRecord(outcome.project) ? outcome.project : outcome;
  return requireValue(
    readString(projection, ["id", "projectId"]),
    "project call returned no project id"
  );
}

function resolveProjectId(
  client: Client,
  config: ArtifactServerMcpConfig
): Effect.Effect<string, ArtifactPublishFailed> {
  return callArtifactTool(client, "project_list", {}).pipe(
    Effect.flatMap((listResult) => {
      const allProjects = recordArrayFromKeys(listResult, ["projects"]);
      const matchingProject = allProjects.find(
        (project) => readString(project, ["name"]) === config.projectName
      );
      if (matchingProject) {
        return readProjectId(matchingProject);
      }
      return callArtifactTool(client, "project_create", {
        name: config.projectName,
      }).pipe(Effect.flatMap(readProjectId));
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
  { stagedEntry: ProviderRecord; stagedUploadId: string },
  ArtifactPublishFailed
> {
  return callArtifactTool(client, "artifact_create_upload", {
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
  }).pipe(
    Effect.flatMap((createResult) => {
      const stagedEntry = recordArrayFromKeys(createResult, ["files"]).find(
        (fileEntry) => readString(fileEntry, ["path"]) === input.entryFilename
      );
      return Effect.map(
        requireValue(
          stagedEntry,
          "artifact_create_upload returned no file instructions"
        ),
        (resolvedEntry) => ({
          stagedEntry: resolvedEntry,
          stagedUploadId:
            readString(createResult, ["uploadId"]) ??
            readString(createResult, ["commit", "uploadId"]) ??
            "",
        })
      );
    })
  );
}

function uploadStagedEntryBytes(
  stagedEntry: ProviderRecord,
  config: ArtifactServerMcpConfig,
  input: ArtifactPublicationInput
): Effect.Effect<void, ArtifactPublishFailed> {
  return Effect.gen(function* uploadEntry() {
    const uploadUrl = yield* requireValue(
      readString(stagedEntry, ["uploadUrl"]),
      "upload stage returned no upload URL"
    );
    const uploadMethod = readString(stagedEntry, ["method"]) ?? "PUT";
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
  return callArtifactTool(client, "artifact_commit_upload", {
    idempotencyKey: crypto.randomUUID(),
    projectId,
    target: {
      kind: "new_artifact",
      name: input.title,
      tags: [],
    },
    uploadId: stagedUploadId,
  }).pipe(
    Effect.flatMap((commitResult) => {
      const linkRecord = isRecord(commitResult.links) ? commitResult.links : {};
      const artifactRecord = isRecord(commitResult.artifact)
        ? commitResult.artifact
        : {};
      const versionRecord = isRecord(commitResult.version)
        ? commitResult.version
        : {};
      return Effect.map(
        requireValue(
          readString(linkRecord, ["review"]),
          "artifact_commit_upload returned no review link"
        ),
        (resolvedReviewLink) => ({
          artifactId: readString(artifactRecord, ["id"]) ?? "",
          links: {
            artifact: readString(linkRecord, ["artifact"]) ?? "",
            review: resolvedReviewLink,
            version: readString(linkRecord, ["version"]) ?? "",
          },
          versionId: readString(versionRecord, ["id"]) ?? "",
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
