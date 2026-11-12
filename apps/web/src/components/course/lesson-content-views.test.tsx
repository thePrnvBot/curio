import type { LessonContent } from "@curio/api/domain/course";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LessonContentView } from "./lesson-content-views";

const LONG_OPTION =
  "The number of Durable Objects a single container can host across every region and every deployment, out of the documented total of 28";

const RECAP_CONTENT: LessonContent = {
  kind: "recap",
  questions: [
    {
      answerIndex: 2,
      explanation:
        "The epoch fences off stale owners, so only the current owner's writes commit.",
      options: [
        "It routes requests to the fastest replica",
        LONG_OPTION,
        "It fences off stale owners, so only the current owner's writes commit",
        "It decides which node has the most free memory",
      ],
      prompt:
        "In the placement pseudocode, what does the epoch actually prevent when two nodes believe they own the same Durable Object?",
    },
  ],
};

function renderRecap(content: LessonContent = RECAP_CONTENT) {
  return render(
    <LessonContentView
      lesson={{
        completed: false,
        content,
        id: "lesson-recap",
        kind: "recap",
        position: 1,
        title: "Recap",
      }}
    />
  );
}

describe("recap exercise options", () => {
  it("renders long option text in full", () => {
    renderRecap();

    expect(screen.getByText(LONG_OPTION)).toBeInTheDocument();
  });

  it("lays every option out as a full-width row", () => {
    renderRecap();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);

    for (const radio of radios) {
      const label = radio.closest("label");
      expect(label).toHaveClass("flex", "w-full", "min-w-0");
    }
  });

  it("wraps long words inside an option instead of overflowing", () => {
    renderRecap();

    expect(screen.getByText(LONG_OPTION)).toHaveClass(
      "min-w-0",
      "flex-1",
      "wrap-anywhere"
    );
  });

  it("still grades a question with long options", () => {
    renderRecap();

    fireEvent.click(
      screen.getByText(
        "It fences off stale owners, so only the current owner's writes commit"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Check answers" }));

    expect(
      screen.getByText("All correct - move on when ready.")
    ).toBeInTheDocument();
    expect(screen.getByText("correct")).toBeInTheDocument();
  });
});
