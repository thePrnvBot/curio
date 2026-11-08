import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProgressFromZero } from "./animated-progress";

describe("ProgressFromZero", () => {
  it("renders the progress bar", () => {
    render(<ProgressFromZero className="h-2 rounded" percent={75} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("clamps percent to 0-100", async () => {
    const { rerender } = render(
      <ProgressFromZero className="h-2 rounded" percent={-10} />
    );
    await vi.waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveValue(0);
    });

    rerender(<ProgressFromZero className="h-2 rounded" percent={110} />);
    await vi.waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveValue(100);
    });
  });
});
