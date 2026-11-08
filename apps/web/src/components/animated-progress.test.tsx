import { act, render, screen } from "@testing-library/react";
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
    // Flush the mount animation frame inside act so its state update is not
    // reported as an unwrapped update.
    await act(async () => {
      // oxlint-disable-next-line promise/avoid-new -- flush one animation frame
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    await vi.waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveValue(0);
    });

    rerender(<ProgressFromZero className="h-2 rounded" percent={110} />);
    await vi.waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveValue(100);
    });
  });
});
