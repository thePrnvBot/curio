import { describe, expect, it } from "vitest";

import { ModelCredentialRequired } from "../domain/model-settings";
import { resolveProviderCredential } from "./model-settings-credential";

const CUSTOM_BASE_URL = "https://gateway.example.com/v1";

describe("resolveProviderCredential", () => {
  it("rejects a new custom endpoint without a key", () => {
    const result = resolveProviderCredential({
      apiKey: undefined,
      baseUrl: CUSTOM_BASE_URL,
      existingSettings: null,
      provider: "openai-compatible",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ModelCredentialRequired);
      expect(result.error.baseUrl).toBe(CUSTOM_BASE_URL);
      expect(result.error.message).toContain("personal API key");
    }
  });

  it("allows a custom endpoint when the request carries a key", () => {
    expect(
      resolveProviderCredential({
        apiKey: "sk-user-key-123456789012345",
        baseUrl: CUSTOM_BASE_URL,
        existingSettings: null,
        provider: "openai-compatible",
      })
    ).toEqual({ ok: true });
  });

  it("trims a typed key before deciding it is usable", () => {
    expect(
      resolveProviderCredential({
        apiKey: "  sk-user-key-123456789012345  ",
        baseUrl: CUSTOM_BASE_URL,
        existingSettings: null,
        provider: "openai-compatible",
      })
    ).toEqual({ ok: true });
  });

  it("allows a blank key when a compatible key is already saved", () => {
    expect(
      resolveProviderCredential({
        apiKey: undefined,
        baseUrl: CUSTOM_BASE_URL,
        existingSettings: {
          apiKey: "sk-saved-key-123456789012345",
          provider: "openai-compatible",
        },
        provider: "openai-compatible",
      })
    ).toEqual({ ok: true });
  });

  it("rejects keeping a key saved for the fixed OpenAI provider", () => {
    const result = resolveProviderCredential({
      apiKey: undefined,
      baseUrl: CUSTOM_BASE_URL,
      existingSettings: {
        apiKey: "sk-saved-key-123456789012345",
        provider: "openai",
      },
      provider: "openai-compatible",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects an explicit clear on a custom endpoint", () => {
    const result = resolveProviderCredential({
      apiKey: null,
      baseUrl: CUSTOM_BASE_URL,
      existingSettings: {
        apiKey: "sk-saved-key-123456789012345",
        provider: "openai-compatible",
      },
      provider: "openai-compatible",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ModelCredentialRequired);
    }
  });

  it("rejects a whitespace-only key on a custom endpoint", () => {
    expect(
      resolveProviderCredential({
        apiKey: "   ",
        baseUrl: CUSTOM_BASE_URL,
        existingSettings: null,
        provider: "openai-compatible",
      }).ok
    ).toBe(false);
  });

  it("allows the fixed OpenAI provider without a key", () => {
    expect(
      resolveProviderCredential({
        apiKey: undefined,
        baseUrl: null,
        existingSettings: null,
        provider: "openai",
      })
    ).toEqual({ ok: true });
  });

  it("allows clearing a key for the fixed OpenAI provider", () => {
    expect(
      resolveProviderCredential({
        apiKey: null,
        baseUrl: null,
        existingSettings: {
          apiKey: "sk-saved-key-123456789012345",
          provider: "openai",
        },
        provider: "openai",
      })
    ).toEqual({ ok: true });
  });
});
