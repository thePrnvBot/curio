import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// ONNX Runtime only uses multiple WASM threads when `SharedArrayBuffer` is
// available, which requires cross-origin isolation. COEP can block
// third-party images/embeds, so enabling it is opt-in for local narration
// benchmarking (see `configureWasmBackend` in kokoro-voice.worker.ts):
//   CURIO_CROSS_ORIGIN_ISOLATION=1 pnpm dev:web
const crossOriginIsolation = process.env.CURIO_CROSS_ORIGIN_ISOLATION === "1";

export default defineConfig({
  server: {
    // Listen on all interfaces so other devices on the local network can
    // reach the dev server (e.g. phone/tablet testing via the LAN IP).
    headers: crossOriginIsolation
      ? {
          "Cross-Origin-Embedder-Policy": "credentialless",
          "Cross-Origin-Opener-Policy": "same-origin",
        }
      : {},
    host: true,
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    // The WebGPU landing shader and the local voice worker are intentionally
    // large lazy chunks; the warning budget applies to eager route code.
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      onwarn(warning, warn) {
        // kokoro-js ships an IIFE bundle that reads `import.meta`; the
        // worker build replaces it with an empty object by design. Plugin
        // timings are informational and noisy for this known slow transform.
        if (
          warning.code === "EMPTY_IMPORT_META" ||
          warning.code === "PLUGIN_TIMINGS"
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
