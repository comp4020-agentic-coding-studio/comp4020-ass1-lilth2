import { defineConfig } from "vitest/config";

// Scoped to spec/*.test.ts only. Without this, Vitest's default glob also
// matches e2e/*.spec.ts — the Playwright end-to-end tests, which use
// @playwright/test's own test()/expect() and must run via `pnpm test:e2e`
// (a real browser, against the built+served site), not under Vitest.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
  },
});
