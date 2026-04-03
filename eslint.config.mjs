import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  eslint.configs.recommended,
  // Main process (Node.js)
  {
    files: ["packages/main/src/**/*.{ts,tsx}", "packages/preload/src/**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["error", "warn", "log"] }],
    },
  },
  // Renderer (browser)
  {
    files: ["packages/renderer/src/**/*.{ts,tsx}", "packages/shared/src/**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      globals: { ...globals.browser },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
];
