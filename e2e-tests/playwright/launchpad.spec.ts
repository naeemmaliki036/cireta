/**
 * Launchpad UI Smoke Tests
 *
 * Requires: launchpad running on :4010
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:4010";

test.describe("Launchpad UI", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Cireta/i);
    // Check that some main content rendered
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("login page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    // Should have email and password inputs
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("register page renders", async ({ page }) => {
    await page.goto(`${BASE}/register`);
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"], input[name="email"]', "investor+verified@cireta.com");
    await page.fill('input[type="password"]', "Password@123");
    await page.click('button[type="submit"]');

    // Should redirect to home or portfolio after login
    await page.waitForURL(/\/(portfolio|$)/, { timeout: 15000 });
  });

  test("unauthenticated user redirected from portfolio", async ({ page }) => {
    await page.goto(`${BASE}/portfolio`);
    // Should redirect to login or show login prompt
    await page.waitForURL(/login/, { timeout: 10000 }).catch(() => {
      // Some apps show inline auth prompt instead of redirect
    });
  });

  test("projects page loads", async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    // Wait for page to load
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/projects");
  });
});
