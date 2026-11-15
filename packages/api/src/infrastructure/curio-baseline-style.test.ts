import { describe, expect, it } from "vitest";

import {
  CURIO_ARTIFACT_CLASSES,
  CURIO_ARTIFACT_DESIGN_RULES,
  CURIO_BASELINE_STYLE,
  withCurioArtifactBaseline,
} from "./curio-baseline-style";

const DOCUMENT =
  "<!DOCTYPE html><html lang=\"en\"><head><title>Notes</title></head><body><h1>Notes</h1></body></html>";

describe("withCurioArtifactBaseline", () => {
  it("injects the stylesheet inside the head", () => {
    const result = withCurioArtifactBaseline(DOCUMENT);
    const headIndex = result.indexOf("<head>") + "<head>".length;
    expect(result.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(result.indexOf(CURIO_BASELINE_STYLE)).toBe(headIndex);
    expect(result).toContain("<h1>Notes</h1>");
  });

  it("inserts before the artifact's own styles so they still win", () => {
    const result = withCurioArtifactBaseline(
      "<html><head><style>body{color:red}</style></head><body></body></html>"
    );
    expect(result.indexOf(CURIO_BASELINE_STYLE)).toBeLessThan(
      result.indexOf("body{color:red}")
    );
  });

  it("falls back to the html element when there is no head", () => {
    const result = withCurioArtifactBaseline("<html><body>Hi</body></html>");
    expect(result).toBe(
      `<html>${CURIO_BASELINE_STYLE}<body>Hi</body></html>`
    );
  });

  it("keeps a doctype document out of quirks mode", () => {
    const result = withCurioArtifactBaseline("<!DOCTYPE html><p>Hi</p>");
    expect(result.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(result).toContain(CURIO_BASELINE_STYLE);
  });

  it("prepends when the artifact is a bare fragment", () => {
    expect(withCurioArtifactBaseline("<p>Hi</p>")).toBe(
      `${CURIO_BASELINE_STYLE}<p>Hi</p>`
    );
  });

  it("is idempotent", () => {
    const once = withCurioArtifactBaseline(DOCUMENT, "dark");
    expect(withCurioArtifactBaseline(once, "dark")).toBe(once);
  });

  it("forces the app's scheme instead of the OS preference", () => {
    const result = withCurioArtifactBaseline(DOCUMENT, "dark");
    expect(result).toContain('data-curio-scheme","dark"');
    // The stylesheet must honour the forced attribute in both directions.
    expect(CURIO_BASELINE_STYLE).toContain(
      ':root[data-curio-scheme="dark"]'
    );
    expect(CURIO_BASELINE_STYLE).toContain(
      ':root:not([data-curio-scheme="light"])'
    );
  });

  it("adds no scheme script when the scheme is unknown", () => {
    expect(withCurioArtifactBaseline(DOCUMENT)).not.toContain(
      "<script data-curio-scheme"
    );
  });
});

describe("CURIO_BASELINE_STYLE", () => {
  it("styles every class the design rules are allowed to name", () => {
    for (const className of CURIO_ARTIFACT_CLASSES) {
      expect(CURIO_BASELINE_STYLE).toContain(`.${className}`);
      expect(CURIO_ARTIFACT_DESIGN_RULES).toContain(className);
    }
  });

  it("carries the light and dark token sets", () => {
    expect(CURIO_BASELINE_STYLE).toContain("--bg:oklch(97.2% 0.008 150)");
    expect(CURIO_BASELINE_STYLE).toContain("--bg:oklch(0% 0 0)");
    expect(CURIO_BASELINE_STYLE).toContain("prefers-color-scheme:dark");
    expect(CURIO_BASELINE_STYLE).toContain('data-curio-baseline');
  });

  it("uses tokens only — no hard-coded colours or depth effects", () => {
    const css = CURIO_BASELINE_STYLE;
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain("rgba(");
    expect(css).not.toContain("gradient");
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("backdrop-filter");
  });

  it("never relies on a font the sandbox cannot load", () => {
    // Geist is listed first but every stack keeps a system fallback, because
    // the artifact frame is a null-origin document with no app fonts.
    expect(CURIO_BASELINE_STYLE).toContain("system-ui");
    expect(CURIO_BASELINE_STYLE).toContain("monospace");
  });
});

describe("CURIO_ARTIFACT_DESIGN_RULES", () => {
  it("forbids the tells of generated slop", () => {
    for (const banned of [
      "Lorem ipsum",
      "emoji",
      "gradient",
      "placeholder",
    ]) {
      expect(CURIO_ARTIFACT_DESIGN_RULES.toLowerCase()).toContain(
        banned.toLowerCase()
      );
    }
  });

  it("says the baseline is applied automatically", () => {
    expect(CURIO_ARTIFACT_DESIGN_RULES).toContain("automatically");
  });
});
