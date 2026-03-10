import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/client/**",
      "packages/sdk/**",
      "packages/realtime-contract/**"
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/server/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "no-empty": "off",
      "preserve-caught-error": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["apps/client/**", "**/apps/client/**"],
              message: "Server must not import from Client."
            },
            {
              group: ["**/engine/odds/**", "apps/server/src/engine/odds/**", "./odds/**", "../odds/**", "../../engine/odds/**"],
              message: "Gameplay Core must not import Advisory Math"
            }
          ]
        }
      ]
    }
  }
);
