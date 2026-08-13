import { defineConfig } from "@playwright/test";

// e2e checks for the phantom-jam prototype: the core interaction end to end
// in a real browser, at both marking viewports, keyboard-only. Runs against
// the built site (`pnpm build` first), same as the invariants in spec/ — not
// part of `pnpm check` (that stays fast, DOM-only); run explicitly with
// `pnpm test:e2e` before shipping, per CLAUDE.md.
export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm preview --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4173",
  },
});
