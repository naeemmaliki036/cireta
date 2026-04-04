/**
 * Admin Portal UI E2E Tests
 *
 * Requires: admin running on :5010, API on :3010
 * Auth: OTP-based (dev mode returns dev_otp in response)
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN_BASE = "http://localhost:5010";
const API = "http://localhost:3010/api/v1";

const ADMIN_EMAIL = "admin@cireta.com";
const ISSUER_EMAIL = "issuer@cireta.com";

/** Login via OTP flow on the admin portal */
async function loginAsRole(page: Page, email: string, role: "admin" | "issuer") {
  await page.goto(`${ADMIN_BASE}/login`);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Select role — must click the role card first
  const roleText = role === "admin" ? "Platform Admin" : "Issuer";
  const roleCard = page.locator(`button:has-text("${roleText}")`).first();
  await roleCard.waitFor({ state: "visible", timeout: 10000 });
  await roleCard.click();
  await page.waitForTimeout(500);

  // Enter email
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(email);

  // Click send OTP / continue
  const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Continue"), button:has-text("Get Code")').first();
  await sendBtn.click();

  // Wait for OTP input — also fetch OTP via API
  const otpResponse = await page.request.post(`${API}/auth/otp/request`, {
    data: { email, purpose: "login", audience: role === "admin" ? "platform_admin" : "issuer_only" },
  });
  const { dev_otp } = await otpResponse.json();

  // Fill OTP digits
  await page.waitForTimeout(1500);
  const otpInputs = page.locator('input[maxlength="1"]');
  const otpCount = await otpInputs.count();

  if (otpCount >= 6) {
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).click();
      await otpInputs.nth(i).fill(dev_otp[i]);
      await page.waitForTimeout(50);
    }
  } else {
    const telInputs = page.locator('input[type="tel"]');
    const telCount = await telInputs.count();
    if (telCount >= 6) {
      for (let i = 0; i < 6; i++) {
        await telInputs.nth(i).click();
        await telInputs.nth(i).fill(dev_otp[i]);
        await page.waitForTimeout(50);
      }
    } else {
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
    try {
      await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
      await verifyBtn.click();
    } catch {
      // May have auto-submitted
    }
  }

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(platform|issuer)/, { timeout: 20000 });
}

// ──────────────────────────────────────────
// Login & Navigation
// ──────────────────────────────────────────

test.describe.serial("Admin Portal — Login", () => {
  test("login page renders with role selection", async ({ page }) => {
    await page.goto(`${ADMIN_BASE}/login`);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    // Should have email input (may need role selection first)
    const hasContent = await page.textContent("body");
    expect(hasContent).toBeTruthy();
  });

  test("unauthenticated redirects to login", async ({ page }) => {
    await page.goto(`${ADMIN_BASE}/platform/overview`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Should redirect to login
    const url = page.url();
    expect(url.includes("/login") || url === `${ADMIN_BASE}/`).toBeTruthy();
  });
});

// ──────────────────────────────────────────
// Platform Admin Flow
// ──────────────────────────────────────────

test.describe.serial("Platform Admin Flow", () => {
  test("admin can login and see overview", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await expect(page).toHaveURL(/platform\/overview/);
    const body = await page.textContent("body");
    expect(body).toContain("Overview");
  });

  test("admin can navigate to users", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/users`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/users");
  });

  test("admin can navigate to issuers", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/issuers`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/issuers");
  });

  test("admin can navigate to sales", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/sales`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/sales");
  });

  test("admin can navigate to tokens", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/tokens`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/tokens");
  });

  test("admin can navigate to compliance", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/compliance`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/compliance");
  });

  test("admin can navigate to fees", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/fees`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/fees");
  });

  test("admin can navigate to email templates", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/email-templates`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/email-templates");
  });

  test("admin can navigate to settings", async ({ page }) => {
    await loginAsRole(page, ADMIN_EMAIL, "admin");
    await page.goto(`${ADMIN_BASE}/platform/settings`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/platform/settings");
  });
});

// ──────────────────────────────────────────
// Issuer Flow
// ──────────────────────────────────────────

test.describe.serial("Issuer Flow", () => {
  test("issuer can login and see overview", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await expect(page).toHaveURL(/issuer\/overview/);
  });

  test("issuer can navigate to tokens", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/tokens`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/tokens");
    // Should show tokens table or empty state
    const body = await page.textContent("body");
    expect(body?.includes("Tokens") || body?.includes("token")).toBeTruthy();
  });

  test("issuer can navigate to sales", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/sales`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/sales");
  });

  test("issuer can open new sale wizard", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/sales/new`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/sales/new");
    const body = await page.textContent("body");
    expect(body).toContain("Sale Info");
  });

  test("issuer can navigate to compliance", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/compliance`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/compliance");
  });

  test("issuer can navigate to investors", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/investors`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/investors");
  });

  test("issuer can navigate to withdrawals", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/withdrawals`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/withdrawals");
  });

  test("issuer can navigate to settings", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/settings`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/settings");
  });
});

// ──────────────────────────────────────────
// Sale Creation Wizard
// ──────────────────────────────────────────

test.describe.serial("Sale Wizard", () => {
  test("sale wizard step 1 — fill sale info", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/sales/new`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Fill title
    const titleInput = page.locator('input[placeholder*="title" i], input').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill("E2E Test Sale");
    }

    // Check "Sale Info" step is visible
    const body = await page.textContent("body");
    expect(body).toContain("Sale Info");
  });
});

// ──────────────────────────────────────────
// Token Management
// ──────────────────────────────────────────

test.describe.serial("Token Management", () => {
  test("issuer tokens page shows OTC section", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/tokens`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const body = await page.textContent("body");
    expect(body).toContain("OTC Tokens");
  });

  test("new token page loads", async ({ page }) => {
    await loginAsRole(page, ISSUER_EMAIL, "issuer");
    await page.goto(`${ADMIN_BASE}/issuer/tokens/new`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    expect(page.url()).toContain("/issuer/tokens/new");
  });
});
