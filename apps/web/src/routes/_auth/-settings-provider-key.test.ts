import { describe, expect, it } from "vitest";

import {
  providerKeyUpdateToInput,
  resolveProviderKeyUpdate,
} from "./-settings-provider-key";

describe("resolveProviderKeyUpdate", () => {
  it("keeps the saved key when the field is blank and a key exists", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: true,
        typedKey: "",
      })
    ).toEqual({ kind: "keep" });
  });

  it("clears when the field is blank and no key exists", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: false,
        typedKey: "",
      })
    ).toEqual({ kind: "clear" });
  });

  it("replaces the saved key with a typed key", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: true,
        typedKey: "sk-new-12345678901234567890",
      })
    ).toEqual({ kind: "set", apiKey: "sk-new-12345678901234567890" });
  });

  it("trims a typed key before saving it", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: false,
        typedKey: "  sk-new-12345678901234567890  ",
      })
    ).toEqual({ kind: "set", apiKey: "sk-new-12345678901234567890" });
  });

  it("treats a whitespace-only key as blank and keeps a saved key", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: true,
        typedKey: "   \n\t ",
      })
    ).toEqual({ kind: "keep" });
  });

  it("treats a whitespace-only key as blank and clears when nothing is saved", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: false,
        hasSavedKey: false,
        typedKey: "   ",
      })
    ).toEqual({ kind: "clear" });
  });

  it("lets an explicit clear win over a saved key", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: true,
        hasSavedKey: true,
        typedKey: "",
      })
    ).toEqual({ kind: "clear" });
  });

  it("lets an explicit clear win over a typed key", () => {
    expect(
      resolveProviderKeyUpdate({
        clearRequested: true,
        hasSavedKey: true,
        typedKey: "sk-new-12345678901234567890",
      })
    ).toEqual({ kind: "clear" });
  });
});

describe("providerKeyUpdateToInput", () => {
  it("maps keep to undefined so the store leaves the key alone", () => {
    expect(providerKeyUpdateToInput({ kind: "keep" })).toBeUndefined();
  });

  it("maps clear to null", () => {
    expect(providerKeyUpdateToInput({ kind: "clear" })).toBeNull();
  });

  it("maps a typed key to its value", () => {
    expect(
      providerKeyUpdateToInput({
        kind: "set",
        apiKey: "sk-new-12345678901234567890",
      })
    ).toBe("sk-new-12345678901234567890");
  });
});
