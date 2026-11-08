import { describe, expect, it } from "vitest";

import {
  isBlockedIpv4,
  isBlockedIpv6,
  isPublicHttpUrl,
} from "./web-reader";

describe("web-reader url filtering", () => {
  describe("isBlockedIpv4", () => {
    it("blocks private and special ranges", () => {
      expect(isBlockedIpv4("0.0.0.0")).toBe(true);
      expect(isBlockedIpv4("10.0.0.1")).toBe(true);
      expect(isBlockedIpv4("127.0.0.1")).toBe(true);
      expect(isBlockedIpv4("172.16.0.1")).toBe(true);
      expect(isBlockedIpv4("192.168.1.1")).toBe(true);
      expect(isBlockedIpv4("169.254.169.254")).toBe(true);
      expect(isBlockedIpv4("100.64.0.1")).toBe(true);
      expect(isBlockedIpv4("198.18.0.1")).toBe(true);
      expect(isBlockedIpv4("224.0.0.1")).toBe(true);
    });

    it("allows public addresses", () => {
      expect(isBlockedIpv4("1.1.1.1")).toBe(false);
      expect(isBlockedIpv4("8.8.8.8")).toBe(false);
      expect(isBlockedIpv4("example.com")).toBe(false);
    });
  });

  describe("isBlockedIpv6", () => {
    it("blocks loopback and link-local", () => {
      expect(isBlockedIpv6("::1")).toBe(true);
      expect(isBlockedIpv6("fe80::1")).toBe(true);
    });

    it("blocks unique-local", () => {
      expect(isBlockedIpv6("fc00::1")).toBe(true);
      expect(isBlockedIpv6("fd00::1")).toBe(true);
    });

    it("blocks ipv4-mapped loopback", () => {
      expect(isBlockedIpv6("::ffff:127.0.0.1")).toBe(true);
      expect(isBlockedIpv6("::ffff:192.168.1.1")).toBe(true);
    });

    it("allows public ipv6", () => {
      expect(isBlockedIpv6("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("isPublicHttpUrl", () => {
    it("accepts public http and https urls", () => {
      expect(isPublicHttpUrl("https://example.com")).toBe(true);
      expect(isPublicHttpUrl("http://example.com/path")).toBe(true);
    });

    it("rejects non-http protocols", () => {
      expect(isPublicHttpUrl("ftp://example.com")).toBe(false);
      expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    });

    it("rejects localhost and local domains", () => {
      expect(isPublicHttpUrl("http://localhost:3000")).toBe(false);
      expect(isPublicHttpUrl("http://app.local")).toBe(false);
      expect(isPublicHttpUrl("http://service.internal")).toBe(false);
    });

    it("rejects private ipv4 urls", () => {
      expect(isPublicHttpUrl("http://127.0.0.1")).toBe(false);
      expect(isPublicHttpUrl("http://192.168.1.1")).toBe(false);
    });

    it("rejects numeric or hex hostnames", () => {
      expect(isPublicHttpUrl("http://2130706433")).toBe(false);
      expect(isPublicHttpUrl("http://0x7f000001")).toBe(false);
    });

    it("rejects malformed urls", () => {
      expect(isPublicHttpUrl("not a url")).toBe(false);
    });
  });
});
