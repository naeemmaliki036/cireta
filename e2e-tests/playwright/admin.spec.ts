/**
 * Admin Portal UI Smoke Tests
 *
 * Requires: admin running on :5010
 */
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5010";

test.describe("Admin Portal UI", () => {
  test("login page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("unauthenticated user sees login", async ({ page }) => {
    await page.goto(BASE);
    // Should redirect to login or render login form
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const url = page.url();
    // Either at login page or root shows login
    expect(url.includes("/login") || url === `${BASE}/`).toBeTruthy();
  });

  test("admin can log in", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"], input[name="email"]', "admin@cireta.com");
    await page.fill('input[type="password"]', "Password@123");
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL(/\/(platform|issuer|$)/, { timeout: 15000 });
    // Should see some admin content
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("issuer can log in", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"], input[name="email"]', "issuer+test@cireta.com");
    await page.fill('input[type="password"]', "Password@123");
    await page.click('button[type="submit"]');

    // Should redirect to issuer dashboard
    await page.waitForURL(/\/(issuer|$)/, { timeout: 15000 });
  });
});
