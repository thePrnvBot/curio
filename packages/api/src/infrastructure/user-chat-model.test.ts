import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelCredentialRequired } from "../domain/model-settings";
import type { OpenAiCompatibleChatModelConfig } from "./user-chat-model";
import { createUserChatModel } from "./user-chat-model";

const sdkMocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(),
  createOpenAICompatible: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: sdkMocks.createOpenAI,
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: sdkMocks.createOpenAICompatible,
}));

const SERVER_KEY = "server-deployment-key";
const USER_KEY = "sk-user-key-123456789012345";
const CUSTOM_BASE_URL = "https://gateway.example.com/v1";
const SESSION_HEADER = "x-curio-session";

const openAiModel = { modelId: "openai-model" };
const compatibleModel = { modelId: "compatible-model" };

describe("createUserChatModel", () => {
  const openAiProvider = vi.fn(() => openAiModel);
  const compatibleChatModel = vi.fn(() => compatibleModel);

  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.createOpenAI.mockReturnValue(openAiProvider);
    sdkMocks.createOpenAICompatible.mockReturnValue({
      chatModel: compatibleChatModel,
    });
  });

  it("refuses to build a compatible model without a user key", () => {
    // The type forbids this shape; old persisted rows and untyped callers can
    // still produce it, so the runtime guard must fail closed.
    const unsafeConfig = {
      apiKey: null,
      baseUrl: CUSTOM_BASE_URL,
      model: "test-model",
      provider: "openai-compatible",
      sessionHeaderName: SESSION_HEADER,
    } as unknown as OpenAiCompatibleChatModelConfig;

    expect(() =>
      createUserChatModel(unsafeConfig, "chat-1")
    ).toThrow(ModelCredentialRequired);
    expect(sdkMocks.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it("refuses to build a compatible model without a base URL", () => {
    const unsafeConfig = {
      apiKey: USER_KEY,
      baseUrl: null,
      model: "test-model",
      provider: "openai-compatible",
      sessionHeaderName: SESSION_HEADER,
    } as unknown as OpenAiCompatibleChatModelConfig;

    expect(() =>
      createUserChatModel(unsafeConfig, "chat-1")
    ).toThrow(ModelCredentialRequired);
    expect(sdkMocks.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it("builds a compatible model with the user's key and base URL", () => {
    const model = createUserChatModel(
      {
        apiKey: USER_KEY,
        baseUrl: CUSTOM_BASE_URL,
        model: "test-model",
        provider: "openai-compatible",
        sessionHeaderName: SESSION_HEADER,
      },
      "chat-42"
    );

    expect(model).toBe(compatibleModel);
    expect(sdkMocks.createOpenAICompatible).toHaveBeenCalledTimes(1);
    expect(sdkMocks.createOpenAICompatible).toHaveBeenCalledWith({
      apiKey: USER_KEY,
      baseURL: CUSTOM_BASE_URL,
      headers: { [SESSION_HEADER]: "chat-42" },
      includeUsage: true,
      name: "curio-openai-compatible",
    });
    expect(compatibleChatModel).toHaveBeenCalledWith("test-model");
    expect(sdkMocks.createOpenAI).not.toHaveBeenCalled();
  });

  it("lets the fixed OpenAI provider fall back to the server key", () => {
    const model = createUserChatModel(
      {
        apiKey: null,
        model: "gpt-4o-mini",
        provider: "openai",
        sessionHeaderName: SESSION_HEADER,
      },
      "chat-7",
      { serverOpenAiApiKey: SERVER_KEY }
    );

    expect(model).toBe(openAiModel);
    expect(sdkMocks.createOpenAI).toHaveBeenCalledWith({ apiKey: SERVER_KEY });
    expect(openAiProvider).toHaveBeenCalledWith("gpt-4o-mini");
    expect(sdkMocks.createOpenAICompatible).not.toHaveBeenCalled();
  });

  it("lets the fixed OpenAI provider use a personal key", () => {
    createUserChatModel(
      {
        apiKey: USER_KEY,
        model: "gpt-4o-mini",
        provider: "openai",
        sessionHeaderName: SESSION_HEADER,
      },
      "chat-7",
      { serverOpenAiApiKey: SERVER_KEY }
    );

    expect(sdkMocks.createOpenAI).toHaveBeenCalledWith({ apiKey: USER_KEY });
  });
});
