import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "ultracite fix",
  },
});
