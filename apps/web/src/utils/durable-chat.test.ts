import { describe, expect, it } from "vitest";

import type { CommitOutcome } from "./durable-chat";
import { foldStreamFailure, resolveRunEndStatus } from "./durable-chat";

describe("foldStreamFailure", () => {
  it("turns ok into stream-failed", () => {
    const outcome = foldStreamFailure(
      { _tag: "ok" },
      { _tag: "Failure", failure: "boom" }
    );
    expect(outcome).toEqual({ _tag: "stream-failed", cause: "boom" });
  });

  it("preserves commit-failed over stream failure", () => {
    const outcome = foldStreamFailure(
      { _tag: "commit-failed" },
      { _tag: "Failure", failure: "boom" }
    );
    expect(outcome).toEqual({ _tag: "commit-failed" });
  });

  it("preserves stream-failed over another stream failure", () => {
    const firstFailure: CommitOutcome = {
      _tag: "stream-failed",
      cause: "first",
    };
    const outcome = foldStreamFailure(firstFailure, {
      _tag: "Failure",
      failure: "second",
    });
    expect(outcome).toBe(firstFailure);
  });
});

describe("resolveRunEndStatus", () => {
  it("returns done when the commit succeeded and the run was not aborted", () => {
    expect(resolveRunEndStatus({ _tag: "ok" }, false)).toBe("done");
  });

  it("returns stopped when the commit succeeded but the run was aborted", () => {
    expect(resolveRunEndStatus({ _tag: "ok" }, true)).toBe("stopped");
  });

  it("returns error for a commit failure regardless of abort", () => {
    expect(resolveRunEndStatus({ _tag: "commit-failed" }, false)).toBe("error");
    expect(resolveRunEndStatus({ _tag: "commit-failed" }, true)).toBe("error");
  });

  it("returns error for a stream failure regardless of abort", () => {
    expect(
      resolveRunEndStatus({ _tag: "stream-failed", cause: "boom" }, false)
    ).toBe("error");
    expect(
      resolveRunEndStatus({ _tag: "stream-failed", cause: "boom" }, true)
    ).toBe("error");
  });
});
