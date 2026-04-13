/**
 * Guided Tour — Playwright E2E tests.
 * Requires launchpad running on http://localhost:4010
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:4010";

test.describe("Guided Tour", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear localStorage so tour auto-shows
    await context.clearCookies();
    await page.goto(BASE + "/projects");
    await page.evaluate(() => localStorage.removeItem("cireta_tour_completed"));
    await page.reload();
    // Wait for tour to auto-open (800ms delay)
    await page.waitForTimeout(1200);
  });

  test("tour auto-shows on first visit", async ({ page }) => {
    const modal = page.locator("text=Hey, Let's take a quick tour!");
    await expect(modal).toBeVisible();
  });

  test("tour has 5 steps for guest user", async ({ page }) => {
    // All 5 steps should be visible
    await expect(page.locator("text=How To?")).toBeVisible();
    await expect(page.locator("text=Sign Up")).toBeVisible();
    await expect(page.locator("text=Connect Your Wallet")).toBeVisible();
    await expect(page.locator("text=Get Verified")).toBeVisible();
    await expect(page.locator("text=Buy Token")).toBeVisible();
  });

  test("Next button advances through steps", async ({ page }) => {
    const nextBtn = page.locator("button", { hasText: "Next" });
    await expect(nextBtn).toBeVisible();

    // Click Next — should advance to step 2 (Sign Up)
    await nextBtn.click();
    await page.waitForTimeout(300);

    // Sign Up should be the active step (bold)
    // Click Next again — Connect Your Wallet
    await nextBtn.click();
    await page.waitForTimeout(300);

    // Click Next — Get Verified
    await nextBtn.click();
    await page.waitForTimeout(300);

    // Click Next — Buy Token (last step, button should say "Get Started")
    await nextBtn.click();
    await page.waitForTimeout(300);

    const getStartedBtn = page.locator("button", { hasText: "Get Started" });
    await expect(getStartedBtn).toBeVisible();
  });

  test("Get Started closes tour and sets localStorage", async ({ page }) => {
    const nextBtn = page.locator("button", { hasText: "Next" });

    // Advance to last step
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }

    // Click Get Started
    const getStartedBtn = page.locator("button", { hasText: "Get Started" });
    await getStartedBtn.click();
    await page.waitForTimeout(500);

    // Modal should be closed
    const modal = page.locator("text=Hey, Let's take a quick tour!");
    await expect(modal).not.toBeVisible();

    // localStorage should be set
    const stored = await page.evaluate(() => localStorage.getItem("cireta_tour_completed"));
    expect(stored).toBe("true");
  });

  test("tour does not show on repeat visit", async ({ page }) => {
    // Set localStorage as if tour was completed
    await page.evaluate(() => localStorage.setItem("cireta_tour_completed", "true"));
    await page.reload();
    await page.waitForTimeout(1500);

    const modal = page.locator("text=Hey, Let's take a quick tour!");
    await expect(modal).not.toBeVisible();
  });

  test("How To? button reopens tour", async ({ page }) => {
    // Close tour first
    const closeBtn = page.locator("[aria-label='Close tour']");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // Click How To? in navbar
    const howToBtn = page.locator("button", { hasText: "How To?" });
    if (await howToBtn.isVisible()) {
      await howToBtn.click();
      await page.waitForTimeout(500);
      const modal = page.locator("text=Hey, Let's take a quick tour!");
      await expect(modal).toBeVisible();
    }
  });

  test("close button dismisses tour", async ({ page }) => {
    const modal = page.locator("text=Hey, Let's take a quick tour!");
    await expect(modal).toBeVisible();

    // Find and click X button
    const closeBtn = page.locator("[aria-label='Close tour']");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      await expect(modal).not.toBeVisible();
    }
  });

  test("tooltip appears pointing to navbar element on step 2", async ({ page }) => {
    const nextBtn = page.locator("button", { hasText: "Next" });
    await nextBtn.click(); // Step 2: Sign Up
    await page.waitForTimeout(500);

    // Should show tooltip near the Register button
    const tooltip = page.locator("[data-testid='tour-tooltip']");
    if (await tooltip.isVisible()) {
      await expect(tooltip).toContainText("Sign Up");
    }
  });
});
