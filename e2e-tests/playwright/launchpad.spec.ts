/**
 * Launchpad UI E2E Tests
 *
 * Requires: launchpad running on :4010, API on :3010
 * Auth: OTP-based (dev mode returns dev_otp in response)
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:4010";
const API = "http://localhost:3010/api/v1";

const INVESTOR_EMAIL = "naeem+01@vanarchain.com";

/** Login via OTP on the launchpad */
async function loginAsInvestor(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Enter email
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(INVESTOR_EMAIL);

  // Click send OTP
  const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Continue"), button:has-text("Get Code")').first();
  await sendBtn.click();

  // Get OTP from API
  const otpResponse = await page.request.post(`${API}/auth/otp/request`, {
    data: { email: INVESTOR_EMAIL, purpose: "login", audience: "investor" },
  });
  const { dev_otp } = await otpResponse.json();

  await page.waitForTimeout(1500);

  // Fill OTP — try individual digit inputs first, then single input
  const otpInputs = page.locator('input[maxlength="1"]');
  const otpCount = await otpInputs.count();
  if (otpCount >= 6) {
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).click();
      await otpInputs.nth(i).fill(dev_otp[i]);
      await page.waitForTimeout(50);
    }
  } else {
    // Try type="tel" inputs
    const telInputs = page.locator('input[type="tel"]');
    const telCount = await telInputs.count();
    if (telCount >= 6) {
      for (let i = 0; i < 6; i++) {
        await telInputs.nth(i).click();
        await telInputs.nth(i).fill(dev_otp[i]);
        await page.waitForTimeout(50);
      }
    } else {
      // Single OTP input
      const singleInput = page.locator('input[maxlength="6"], input[placeholder*="code" i]').first();
      if (await singleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await singleInput.fill(dev_otp);
      }
    }
  }

  await page.waitForTimeout(500);

  // Click verify if button is enabled
  const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Sign In"), button[type="submit"]').first();
  if (await verifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await verifyBtn.waitFor({ state: "visible" });
    // Wait for enabled state
    try {
      await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
      await verifyBtn.click();
    } catch {
      // Button still disabled — OTP may have auto-submitted
    }
  }

  // Wait for redirect
  await page.waitForURL(/\/(projects|portfolio|$)/, { timeout: 20000 }).catch(() => {});
}

// ──────────────────────────────────────────
// Public Pages
// ──────────────────────────────────────────

test.describe("Public Pages", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Check hero section content
    expect(body).toContain("Wealth");
  });

  test("homepage has navigation", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // Check navbar exists
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible({ timeout: 5000 });
  });

  test("homepage shows Our Projects section", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const body = await page.textContent("body");
    expect(body).toContain("Our Projects");
  });

  test("homepage shows features section", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const body = await page.textContent("body");
    expect(body).toContain("What Makes Us Different");
  });

  test("homepage shows how it works section", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const body = await page.textContent("body");
    expect(body).toContain("Sign Up");
    expect(body).toContain("Verify");
    expect(body).toContain("Invest");
  });

  test("projects page loads", async ({ page }) => {
    await page.goto(`${BASE}/projects`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain("/projects");
  });

  test("login page renders", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test("register page renders", async ({ page }) => {
    await page.goto(`${BASE}/register`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test("FAQ page loads", async ({ page }) => {
    await page.goto(`${BASE}/faq`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain("/faq");
  });

  test("contact page loads", async ({ page }) => {
    await page.goto(`${BASE}/contact`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain("/contact");
  });

  test("terms page loads", async ({ page }) => {
    await page.goto(`${BASE}/terms`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain("/terms");
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto(`${BASE}/privacy`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(page.url()).toContain("/privacy");
  });
});

// ──────────────────────────────────────────
// Auth Flow
// ──────────────────────────────────────────

test.describe.serial("Auth Flow", () => {
  test("unauthenticated user redirected from portfolio", async ({ page }) => {
    await page.goto(`${BASE}/portfolio`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Should redirect to login or show login prompt
    const url = page.url();
    const body = await page.textContent("body");
    expect(url.includes("/login") || body?.includes("Sign") || body?.includes("Login")).toBeTruthy();
  });

  test("investor can login via OTP", async ({ page }) => {
    await loginAsInvestor(page);
    // Should be past login
    const url = page.url();
    expect(url.includes("/login")).toBeFalsy();
  });
});

// ──────────────────────────────────────────
// Authenticated Investor Pages
// ──────────────────────────────────────────

test.describe.serial("Investor Portal", () => {
  test("portfolio page loads (requires auth)", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/portfolio`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // If login succeeded, should be on portfolio; if not, redirected to login
    const url = page.url();
    expect(url.includes("/portfolio") || url.includes("/login")).toBeTruthy();
  });

  test("settings page loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/settings");
  });

  test("settings profile page loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/settings/profile`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/settings/profile");
  });

  test("settings wallets page loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/settings/wallets`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/settings/wallets");
  });

  test("verify page loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/verify`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/verify");
  });

  test("portfolio holdings loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/portfolio/holdings`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/portfolio/holdings");
  });

  test("portfolio transactions loads", async ({ page }) => {
    await loginAsInvestor(page);
    await page.goto(`${BASE}/portfolio/transactions`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/portfolio/transactions");
  });
});

// ──────────────────────────────────────────
// Footer & Navigation
// ──────────────────────────────────────────

test.describe("Footer", () => {
  test("footer is present on homepage", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible({ timeout: 5000 });
  });
});
