import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "engines",
          environment: "node",
          include: ["src/engines/**/*.{test,spec}.ts"],
          globals: true,
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
        test: {
          name: "app",
          environment: "jsdom",
          include: [
            "src/app/**/*.{test,spec}.{ts,tsx}",
            "src/components/**/*.{test,spec}.{ts,tsx}",
            "src/lib/**/*.{test,spec}.{ts,tsx}",
          ],
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
