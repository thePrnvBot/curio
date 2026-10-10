import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "apps/web/.tanstack/**",
    "apps/web/.vinxi/**",
    "packages/db/src/schema/auth.ts",
  ],
  rules: {
    "eslint/func-style": "off",
    "react/function-component-definition": "off",
  },
  overrides: [
    {
      files: ["packages/db/src/schema/index.ts"],
      rules: {
        "oxc/no-barrel-file": "off",
      },
    },
    {
      files: ["packages/ui/src/components/input-group.tsx"],
      rules: {
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
      },
    },
    {
      files: ["packages/ui/src/components/label.tsx"],
      rules: {
        "jsx-a11y/label-has-associated-control": "off",
      },
    },
  ],
});
