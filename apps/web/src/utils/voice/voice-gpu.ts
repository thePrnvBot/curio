/**
 * Read-only WebGPU adapter discovery for the settings page.
 *
 * WebGPU deliberately does not expose an adapter list: `requestAdapter()` only
 * takes a power hint and the browser decides which physical GPU answers. The
 * best a page can do is ask for each hint, read the returned `GPUAdapterInfo`,
 * and show the real GPU names it got back. On Windows Chrome the hint is
 * currently ignored (Chrome shares one adapter with the rest of the browser),
 * so both requests may resolve to the same GPU; that GPU is still displayed by
 * name instead of a "high performance" placeholder.
 */

import type { VoiceGpuPreference } from "./voice-cache";

/** GPU-valued preferences only; `wasm` is the explicit CPU option. */
export type VoiceGpuAdapterId = Exclude<VoiceGpuPreference, "wasm">;

export interface VoiceGpuAdapter {
  /** The power hint that produced this adapter; this is what we persist and
   * pass to `requestAdapter()` when the worker boots. */
  readonly id: VoiceGpuAdapterId;
  /** Friendly name reported by the browser, e.g. "NVIDIA GeForce RTX 4070". */
  readonly name: string;
}

export interface VoiceGpuDetection {
  /** Unique adapters, best first. Empty when WebGPU is unavailable. */
  readonly adapters: readonly VoiceGpuAdapter[];
  /** True when the browser (Firefox) blanks every adapter name. The options
   * then name the power hint instead, because no real name exists. */
  readonly namesHidden: boolean;
  readonly webgpuAvailable: boolean;
}

export interface GpuAdapterInfoLike {
  readonly architecture?: string;
  readonly description?: string;
  readonly device?: string;
  readonly isFallbackAdapter?: boolean;
  readonly vendor?: string;
}

const REQUEST_ORDER: readonly VoiceGpuAdapterId[] = [
  "high-performance",
  "low-power",
  "auto",
];

const VENDOR_NAMES: Readonly<Record<string, string>> = {
  amd: "AMD",
  apple: "Apple",
  arm: "ARM",
  google: "Google",
  imagination: "Imagination",
  intel: "Intel",
  microsoft: "Microsoft",
  qualcomm: "Qualcomm",
  nvidia: "NVIDIA",
};

function displayVendor(vendor: string | undefined): string {
  if (vendor === undefined) {
    return "";
  }
  const trimmed = vendor.trim();
  return VENDOR_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

/** `description` is the friendly name when the browser fills it in; otherwise
 * fall back to the vendor/architecture/device triple. */
export function formatGpuAdapterName(info?: GpuAdapterInfoLike): string | null {
  if (info === undefined) {
    return null;
  }
  if (info.description !== undefined && info.description.trim() !== "") {
    return info.description.trim();
  }
  const parts = [
    displayVendor(info.vendor),
    info.architecture?.trim() ?? "",
    info.device?.trim() ?? "",
  ].filter((part) => part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

async function requestAdapter(
  id: VoiceGpuAdapterId
): Promise<GPUAdapter | null> {
  try {
    const options =
      id === "auto" ? undefined : ({ powerPreference: id } as const);
    return await navigator.gpu.requestAdapter(options);
  } catch {
    return null;
  }
}

/** Adapters may expose `info` synchronously (current spec) or only through the
 * older `requestAdapterInfo()` method. */
async function readAdapterInfo(
  adapter: GPUAdapter
): Promise<GpuAdapterInfoLike | undefined> {
  const existing = (adapter as unknown as { info?: GpuAdapterInfoLike }).info;
  // Some builds expose an empty `info` object and only fill the legacy call.
  if (existing !== undefined && formatGpuAdapterName(existing) !== null) {
    return existing;
  }
  const legacy = (
    adapter as unknown as {
      requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>;
    }
  ).requestAdapterInfo;
  if (typeof legacy !== "function") {
    return existing;
  }
  try {
    return await legacy.call(adapter);
  } catch {
    return existing;
  }
}

/** Firefox blanks `GPUAdapterInfo` for privacy, so fingerprint the adapter
 * through its advertised limits instead. Equal limits usually mean the same
 * physical GPU answered both power-hint requests. */
function adapterLimitsSignature(adapter: GPUAdapter): string {
  const {
    maxBufferSize,
    maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupStorageSize,
    maxStorageBufferBindingSize,
  } = adapter.limits;
  return [
    maxBufferSize,
    maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupStorageSize,
    maxStorageBufferBindingSize,
  ].join(":");
}

export function hiddenGpuAdapterName(
  id: VoiceGpuAdapterId,
  index: number,
  total: number
): string {
  if (total <= 1) {
    return "GPU (name hidden by browser)";
  }
  let hint = "default";
  if (id === "high-performance") {
    hint = "high performance";
  } else if (id === "low-power") {
    hint = "low power";
  }
  return `GPU ${index + 1} · ${hint} (name hidden)`;
}

export async function detectVoiceGpus(): Promise<VoiceGpuDetection> {
  if (typeof navigator === "undefined" || navigator.gpu === undefined) {
    return { adapters: [], namesHidden: false, webgpuAvailable: false };
  }

  interface Candidate {
    readonly id: VoiceGpuAdapterId;
    readonly name: string | null;
  }

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // Sequential: some drivers cannot service two adapter requests at once.
  for (const id of REQUEST_ORDER) {
    // oxlint-disable-next-line no-await-in-loop -- adapter requests are serialized per driver
    const adapter = await requestAdapter(id);
    if (adapter === null) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- info may be an async legacy call
    const info = await readAdapterInfo(adapter);
    if (
      info?.isFallbackAdapter === true ||
      (adapter as unknown as { isFallbackAdapter?: boolean })
        .isFallbackAdapter === true
    ) {
      continue;
    }
    const displayName = formatGpuAdapterName(info);
    const key =
      displayName === null
        ? `limits:${adapterLimitsSignature(adapter)}`
        : `name:${displayName.toLowerCase()}`;
    // Two hints often resolve to the same physical GPU; only list it once.
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push({ id, name: displayName });
  }

  const namesHidden =
    candidates.length > 0 &&
    candidates.every((candidate) => candidate.name === null);
  const adapters = candidates.map((candidate, index) => ({
    id: candidate.id,
    name:
      candidate.name ??
      hiddenGpuAdapterName(candidate.id, index, candidates.length),
  }));

  return { adapters, namesHidden, webgpuAvailable: true };
}

/** The saved hint may not be in the fresh list (driver change, battery state).
 * Keep a readable option for it instead of rendering a blank select. */
export function voiceGpuFallbackLabel(id: VoiceGpuPreference): string {
  if (id === "wasm") {
    return "CPU only (WASM)";
  }
  if (id === "auto") {
    return "Browser default GPU";
  }
  if (id === "high-performance") {
    return "High-performance GPU (not detected)";
  }
  return "Low-power GPU (not detected)";
}
