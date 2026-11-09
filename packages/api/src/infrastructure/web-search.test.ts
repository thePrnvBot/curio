import { describe, expect, it } from "vitest";

import {
  decodeHtmlEntities,
  ddgHrefToUrl,
  duckDuckGoSearch,
  htmlToText,
  parseDdgNextPage,
  parseDdgResults,
} from "./web-search";

describe("web-search", () => {
  describe("decodeHtmlEntities", () => {
    it("decodes common entities", () => {
      expect(decodeHtmlEntities("&amp; &lt; &gt; &quot;")).toBe("& < > \"");
      expect(decodeHtmlEntities("&#x27; &#39;")).toBe("' '");
      expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
    });

    it("leaves plain text unchanged", () => {
      expect(decodeHtmlEntities("hello world")).toBe("hello world");
    });
  });

  describe("htmlToText", () => {
    it("strips tags and decodes entities", () => {
      expect(htmlToText("<b>Hello</b> &amp; welcome")).toBe("Hello & welcome");
    });

    it("trims whitespace", () => {
      expect(htmlToText("  <p>text</p>  ")).toBe("text");
    });
  });

  describe("ddgHrefToUrl", () => {
    it("unwraps uddg redirect parameters", () => {
      expect(
        ddgHrefToUrl("/l/?uddg=https%3A%2F%2Fexample.com%2Fpage")
      ).toBe("https://example.com/page");
    });

    it("returns direct http urls", () => {
      expect(ddgHrefToUrl("https://example.com")).toBe("https://example.com");
      expect(ddgHrefToUrl("http://example.com")).toBe("http://example.com");
    });

    it("returns null for non-urls", () => {
      expect(ddgHrefToUrl("/some/path")).toBeNull();
      expect(ddgHrefToUrl("")).toBeNull();
    });

    it("handles protocol-relative urls", () => {
      expect(ddgHrefToUrl("//example.com/page")).toBe(
        "https://example.com/page"
      );
    });
  });

  describe("parseDdgResults", () => {
    it("extracts title, snippet and url from a result page", () => {
      const html = `
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">
          <span>Example Site</span>
        </a>
        <a class="result__snippet" href="/l/?x=1">This is a useful example site.</a>
      `;

      const results = parseDdgResults(html);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: "Example Site",
        snippet: "This is a useful example site.",
        url: "https://example.com",
      });
    });

    it("deduplicates urls", () => {
      const html = `
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">A</a>
        <a class="result__snippet" href="/l/?x=1">snippet a</a>
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com">B</a>
        <a class="result__snippet" href="/l/?x=2">snippet b</a>
      `;

      expect(parseDdgResults(html)).toHaveLength(1);
    });

    it("skips results without a title", () => {
      const html = `
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com"></a>
        <a class="result__snippet" href="/l/?x=1">snippet</a>
      `;

      expect(parseDdgResults(html)).toHaveLength(0);
    });
  });

  describe("parseDdgNextPage", () => {
    it("extracts hidden inputs from the next-page form", () => {
      const html = `
        <form action="/html/" method="POST">
          <input type="hidden" name="q" value="test">
          <input type="hidden" name="s" value="30">
          <input type="hidden" name="dc" value="31">
          <button class="btn--alt">Next</button>
        </form>
      `;

      const params = parseDdgNextPage(html);
      expect(params).not.toBeNull();
      expect(params?.get("q")).toBe("test");
      expect(params?.get("s")).toBe("30");
      expect(params?.get("dc")).toBe("31");
    });

    it("returns null when there is no next-page form", () => {
      expect(parseDdgNextPage("<div>no form</div>")).toBeNull();
    });
  });

  describe("duckDuckGoSearch", () => {
    it("is exported and returns a promise", () => {
      expect(duckDuckGoSearch("vitest", 3)).toBeInstanceOf(Promise);
    });
  });
});
