import { expect, test } from "@playwright/test";

// End-to-end checks for the core interaction, in a real browser, at both
// marking viewports (see CLAUDE.md: "1920x1080 desktop" and "390x844
// mobile"), keyboard-only, and surviving a resize mid-simulation. The
// physics itself is unit-tested headlessly in spec/phantom-jam.test.ts —
// these tests are about the visitor's actual experience of it.

const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

test.describe("phantom traffic jam — core interaction", () => {
  for (const [name, viewport] of Object.entries({ desktop: DESKTOP, mobile: MOBILE })) {
    test(`loads without horizontal overflow at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator("h1")).toHaveText("Phantom traffic jams");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);
    });
  }

  test("dragging density past the threshold spontaneously forms a wave, with no manual brake ever used", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    const slider = page.locator("#density");
    const stateLabel = page.locator("#state-label");

    await slider.fill("10");
    await page.waitForTimeout(1500);
    await expect(stateLabel).toHaveAttribute("data-state", "free-flow");

    await slider.fill("44");
    await expect(stateLabel).toHaveAttribute("data-state", "jam", {
      timeout: 15_000,
    });
  });

  test("the density slider is fully keyboard-operable", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    // Tab from the top of the page to the slider — no mouse involved.
    let focusedId = await page.evaluate(() => document.activeElement?.id);
    for (let i = 0; i < 6 && focusedId !== "density"; i++) {
      await page.keyboard.press("Tab");
      focusedId = await page.evaluate(() => document.activeElement?.id);
    }
    await expect(page.locator("#density")).toBeFocused();

    const before = await page.locator("#density").inputValue();
    await page.keyboard.press("ArrowRight");
    const after = await page.locator("#density").inputValue();
    expect(Number(after)).toBeGreaterThan(Number(before));
  });

  test("survives a resize mid-simulation without breaking layout", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page.locator("#density").fill("44");
    await page.waitForTimeout(2000);

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(500);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("svg.ring")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
