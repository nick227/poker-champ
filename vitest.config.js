import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        environment: "node",
        globalSetup: ["./vitest.global-setup.ts"],
        include: [
            "src/**/*.test.ts",
            "src/**/__tests__/**/*.test.ts"
        ],
        coverage: {
            reporter: ["text", "html"]
        }
    }
});
