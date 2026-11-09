import { describe, expect, it } from "vitest";

import { createApiKeyCipher } from "./api-key-cipher";

const SECRET = "test-secret-with-at-least-32-characters";
const OTHER_SECRET = "another-secret-with-at-least-32-characters";

describe("api key cipher", () => {
  it("round-trips a saved key", () => {
    const cipher = createApiKeyCipher(SECRET);
    const encrypted = cipher.encrypt("sk-live-1234567890");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("sk-live");
    expect(cipher.decrypt(encrypted)).toBe("sk-live-1234567890");
  });

  it("uses a fresh IV for every encryption", () => {
    const cipher = createApiKeyCipher(SECRET);
    expect(cipher.encrypt("same-key")).not.toBe(cipher.encrypt("same-key"));
  });

  it("reads legacy plaintext rows unchanged", () => {
    const cipher = createApiKeyCipher(SECRET);
    expect(cipher.decrypt("sk-legacy-plain")).toBe("sk-legacy-plain");
  });

  it("does not decrypt with a different secret", () => {
    const encrypted = createApiKeyCipher(SECRET).encrypt("sk-secret");
    expect(createApiKeyCipher(OTHER_SECRET).decrypt(encrypted)).toBeNull();
  });

  it("returns null for tampered ciphertext instead of throwing", () => {
    const cipher = createApiKeyCipher(SECRET);
    const encrypted = cipher.encrypt("sk-secret");
    expect(cipher.decrypt(`${encrypted}tampered`)).toBeNull();
  });

  it("rejects short secrets", () => {
    expect(() => createApiKeyCipher("short")).toThrow();
  });
});
