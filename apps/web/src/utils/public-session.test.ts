import { describe, expect, it } from "vitest";

import { toPublicSession } from "./public-session";

describe("toPublicSession", () => {
  it("maps a full Better Auth session to the public shape", () => {
    const result = toPublicSession({
      id: "session-id",
      token: "secret-session-token",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      userId: "user-id",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      user: {
        id: "user-id",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: "https://example.com/ada.png",
      },
    });

    expect(result).toEqual({
      user: {
        id: "user-id",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: "https://example.com/ada.png",
      },
    });
  });

  it("does not leak sensitive session fields", () => {
    const result = toPublicSession({
      token: "secret-session-token",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      user: {
        id: "user-id",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    });

    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("ipAddress");
    expect(result).not.toHaveProperty("userAgent");
    expect(result).not.toHaveProperty("session");
    expect(result?.user).not.toHaveProperty("token");
    expect(result?.user).not.toHaveProperty("ipAddress");
    expect(result?.user).not.toHaveProperty("userAgent");
    expect(result?.user).not.toHaveProperty("session");
  });

  it("maps null to null", () => {
    expect(toPublicSession(null)).toBeNull();
  });

  it("preserves a null image and allows an omitted image", () => {
    expect(
      toPublicSession({
        user: {
          id: "user-id",
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: null,
        },
      })
    ).toEqual({
      user: {
        id: "user-id",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: null,
      },
    });

    expect(
      toPublicSession({
        user: {
          id: "user-id",
          name: "Ada Lovelace",
          email: "ada@example.com",
        },
      })
    ).toEqual({
      user: {
        id: "user-id",
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    });
  });
});
