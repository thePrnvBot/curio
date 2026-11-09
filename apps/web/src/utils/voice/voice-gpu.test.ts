import { describe, expect, it } from "vitest";

import {
  formatGpuAdapterName,
  hiddenGpuAdapterName,
  voiceGpuFallbackLabel,
} from "./voice-gpu";

describe("formatGpuAdapterName", () => {
  it("prefers the browser's friendly description", () => {
    expect(
      formatGpuAdapterName({
        architecture: "ada",
        description: "NVIDIA GeForce RTX 4070",
        vendor: "nvidia",
      })
    ).toBe("NVIDIA GeForce RTX 4070");
  });

  it("falls back to vendor, architecture and device when no description exists", () => {
    expect(
      formatGpuAdapterName({
        architecture: "gen-12lp",
        device: "0x9a49",
        vendor: "intel",
      })
    ).toBe("Intel · gen-12lp · 0x9a49");
    expect(
      formatGpuAdapterName({ architecture: "apple-m1", vendor: "apple" })
    ).toBe("Apple · apple-m1");
  });

  it("returns null when the browser hides every field", () => {
    expect(formatGpuAdapterName()).toBeNull();
    expect(formatGpuAdapterName({})).toBeNull();
    expect(formatGpuAdapterName({ vendor: "  ", architecture: "" })).toBeNull();
  });
});

describe("hiddenGpuAdapterName", () => {
  it("keeps a single hidden adapter simple", () => {
    expect(hiddenGpuAdapterName("high-performance", 0, 1)).toBe(
      "GPU (name hidden by browser)"
    );
  });

  it("disambiguates multiple hidden adapters by power hint", () => {
    expect(hiddenGpuAdapterName("high-performance", 0, 2)).toBe(
      "GPU 1 · high performance (name hidden)"
    );
    expect(hiddenGpuAdapterName("low-power", 1, 2)).toBe(
      "GPU 2 · low power (name hidden)"
    );
    expect(hiddenGpuAdapterName("auto", 2, 3)).toBe(
      "GPU 3 · default (name hidden)"
    );
  });
});

describe("voiceGpuFallbackLabel", () => {
  it("keeps a readable option for every preference", () => {
    expect(voiceGpuFallbackLabel("wasm")).toBe("CPU only (WASM)");
    expect(voiceGpuFallbackLabel("auto")).toBe("Browser default GPU");
    expect(voiceGpuFallbackLabel("high-performance")).toBe(
      "High-performance GPU (not detected)"
    );
    expect(voiceGpuFallbackLabel("low-power")).toBe(
      "Low-power GPU (not detected)"
    );
  });
});
