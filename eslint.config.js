import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "web/dist/**", "web/src/design-system/**", "node_modules/**", "artifacts/**", ".agentdeck-data/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-console": "off",
      "no-process-exit": "off",
    },
  },
  {
    files: ["web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
);
