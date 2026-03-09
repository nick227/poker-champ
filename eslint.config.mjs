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
    files: ["apps/server/src/**/*.ts", "packages/api-types/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/engine/odds/**", "apps/server/src/engine/odds/**", "./odds/**", "../odds/**", "../../engine/odds/**"],
              message: "Gameplay Core must not import Advisory Math"
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/server/src/engine/odds/**"],
    rules: {
      "no-restricted-imports": "off"
    }
  }
);
