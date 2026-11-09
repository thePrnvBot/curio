import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isBlockedIpv4,
  isBlockedIpv6,
  isPublicHttpUrl,
  resolvePublicRedirect,
} from "./web-reader";

type LookupAll = (
  hostname: string,
  options: { all: true; verbatim: boolean }
) => Promise<{ address: string; family: number }[]>;

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn<LookupAll>(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

const fetchMock = vi.fn<typeof fetch>();

function createResponse(status: number, location?: string): Response {
  const headers = new Headers();
  if (location !== undefined) {
    headers.set("location", location);
  }
  return new Response(null, { headers, status });
}

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

    it("blocks nat64 and 6to4 embedded ipv4 ranges", () => {
      expect(isBlockedIpv6("64:ff9b::7f00:1")).toBe(true);
      expect(isBlockedIpv6("2002:7f00:1::")).toBe(true);
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

describe("resolvePublicRedirect", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the input url when there is no redirect", async () => {
    fetchMock.mockResolvedValue(createResponse(200));

    await expect(
      resolvePublicRedirect("http://93.184.216.34/page")
    ).resolves.toBe("http://93.184.216.34/page");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
    });
  });

  it("rejects a redirect to a private address before fetching it", async () => {
    fetchMock.mockResolvedValue(
      createResponse(302, "http://127.0.0.1:3001/secret")
    );

    await expect(
      resolvePublicRedirect("http://93.184.216.34/start")
    ).rejects.toThrow(/non-public/u);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to a public url and returns the final url", async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse(302, "http://1.1.1.1/final"))
      .mockResolvedValueOnce(createResponse(200));

    await expect(
      resolvePublicRedirect("http://93.184.216.34/start")
    ).resolves.toBe("http://1.1.1.1/final");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(
      resolvePublicRedirect("https://private.example/start")
    ).rejects.toThrow(/non-public address/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    fetchMock.mockResolvedValue(createResponse(200));

    await expect(
      resolvePublicRedirect("https://public.example/page")
    ).resolves.toBe("https://public.example/page");
    expect(lookupMock).toHaveBeenCalledWith("public.example", {
      all: true,
      verbatim: true,
    });
  });

  it("rejects dns failures without fetching", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(
      resolvePublicRedirect("https://missing.example/")
    ).rejects.toThrow("ENOTFOUND");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects after more than five redirects", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(createResponse(302, "http://1.1.1.1/next"))
    );

    await expect(
      resolvePublicRedirect("http://93.184.216.34/start")
    ).rejects.toThrow(/Too many redirects/u);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
