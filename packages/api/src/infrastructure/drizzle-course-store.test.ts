import { describe, expect, it } from "vitest";

import { toLessonSummary } from "./drizzle-course-store";

const summaryRow = {
  completedAt: null,
  hasContent: false,
  id: "lesson-1",
  kind: "cards",
  position: 1,
  title: "Welcome",
};

describe("toLessonSummary", () => {
  it("uses the projected hasContent flag", () => {
    expect(toLessonSummary(summaryRow).hasContent).toBe(false);
    expect(toLessonSummary({ ...summaryRow, hasContent: true }).hasContent).toBe(
      true
    );
  });

  it("derives completion from completedAt", () => {
    expect(toLessonSummary(summaryRow).completed).toBe(false);
    expect(
      toLessonSummary({
        ...summaryRow,
        completedAt: new Date("2026-11-09T00:00:00.000Z"),
      }).completed
    ).toBe(true);
  });

  it("normalizes legacy kinds", () => {
    expect(toLessonSummary({ ...summaryRow, kind: "quiz" }).kind).toBe("cards");
  });

  it("clamps non-positive positions", () => {
    expect(toLessonSummary({ ...summaryRow, position: 0 }).position).toBe(1);
  });
});
