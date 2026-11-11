import { describe, expect, it } from "vitest";

import { rewriteCssUrls, rewriteHtml } from "./proxy";

const basePath = "/api/rabbit-hole/rh_1/proxy/token";
const targetUrl = "https://example.com/docs/page";

describe("rewriteHtml", () => {
  const input = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
    <base href="/">
    <title>Test page</title>
    <link rel="stylesheet" href="/style.css">
    <script src="/app.js" integrity="sha384-nope"></script>
  </head>
  <body>
    <a href="https://other.test/page" target="_blank">Other</a>
    <img src="/img.png" srcset="/img.png 1x, https://cdn.test/img2.png 2x">
    <iframe src="https://www.youtube.com/embed/abc123456"></iframe>
    <p>Hello <strong>world</strong></p>
  </body>
</html>`;

  const result = rewriteHtml(input, {
    basePath,
    parentOrigin: "http://localhost:3001",
    sessionId: "rh_1",
    targetUrl,
    token: "token",
  });

  it("removes framing and integrity blockers", () => {
    expect(result.html.toLowerCase()).not.toContain("content-security-policy");
    expect(result.html.toLowerCase()).not.toContain("<base");
    expect(result.html).not.toContain("integrity=");
  });

  it("rewrites absolute, root-relative and srcset URLs", () => {
    expect(result.html).toContain(`${basePath}/https%3A%2F%2Fother.test/page`);
    expect(result.html).toContain(
      `${basePath}/https%3A%2F%2Fexample.com/img.png`
    );
    expect(result.html).toContain(
      `${basePath}/https%3A%2F%2Fcdn.test/img2.png`
    );
  });

  it("keeps navigation inside the iframe", () => {
    expect(result.html).toContain('target="_self"');
  });

  it("injects the tracker", () => {
    expect(result.html).toContain("data-curio-tracker");
    expect(result.html).toContain('"rh_1"');
    expect(result.html).toContain('"token"');
  });

  it("captures title, text and original media URLs", () => {
    expect(result.title).toBe("Test page");
    expect(result.text).toContain("Hello world");
    expect(result.media).toEqual([
      {
        kind: "video",
        title: undefined,
        url: "https://www.youtube.com/watch?v=abc123456",
      },
    ]);
  });

  it("resolves relative URLs against the target page", () => {
    const relative = rewriteHtml(
      '<html><head><title>x</title></head><body><a href="../next">Next</a></body></html>',
      {
        basePath,
        parentOrigin: "http://localhost:3001",
        sessionId: "rh_1",
        targetUrl,
        token: "token",
      }
    );
    expect(relative.html).toContain(
      `${basePath}/https%3A%2F%2Fexample.com/next`
    );
  });
});

describe("rewriteCssUrls", () => {
  it("rewrites url() and @import references", () => {
    const css = `@import "/base.css"; body { background: url(../img/bg.png); }`;
    expect(
      rewriteCssUrls(css, "https://example.com/styles/app.css", basePath)
    ).toBe(
      `@import "${basePath}/https%3A%2F%2Fexample.com/base.css"; body { background: url(${basePath}/https%3A%2F%2Fexample.com/img/bg.png); }`
    );
  });

  it("leaves data URLs alone", () => {
    const css = ".x { background: url(data:image/png;base64,AAAA); }";
    expect(rewriteCssUrls(css, targetUrl, basePath)).toBe(css);
  });
});
