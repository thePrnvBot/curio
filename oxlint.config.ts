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
    {
      // Vendored AI Elements components follow upstream shadcn/AI Elements
      // patterns that intentionally use bitflags, callbacks, refs-in-render
      // and effect-driven open state. Keep the rules off ONLY for this folder.
      files: ["packages/ui/src/components/ai-elements/**"],
      rules: {
        "eslint/no-bitwise": "off",
        "eslint/no-empty-function": "off",
        "promise/avoid-new": "off",
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "react-hooks/set-state-in-effect": "off",
        "react/refs": "off",
        "unicorn/prefer-add-event-listener": "off",
      },
    },
    {
      // Canned shadcn preset components (applied via `shadcn apply --preset`)
      // ship upstream styling patterns that conflict with repo lint rules.
      files: ["packages/ui/src/components/**"],
      rules: {
        "import/consistent-type-specifier-style": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
        "unicorn/prefer-export-from": "off",
      },
    },
  ],
});
