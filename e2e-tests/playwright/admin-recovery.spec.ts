/**
 * Token Recovery Page — UI E2E Tests
 *
 * Tests the recovery page form behavior, field visibility, validation,
 * and confirmation flow. Does not require blockchain connectivity.
 *
 * Requires: admin running on :5010, API on :3010
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN_BASE = "http://localhost:5010";
const API = "http://localhost:3010/api/v1";
const ISSUER_EMAIL = "issuer@cireta.com";
const RECOVERY_URL = `${ADMIN_BASE}/issuer/compliance/recovery`;

// Valid checksum addresses for form filling
const VALID_ADDR_A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const VALID_ADDR_B = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const INVALID_ADDR = "0xinvalid";

/** Login as issuer via OTP flow */
async function loginAsIssuer(page: Page) {
  await page.goto(`${ADMIN_BASE}/login`);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const roleCard = page.locator('button:has-text("Issuer")').first();
  await roleCard.waitFor({ state: "visible", timeout: 10000 });
  await roleCard.click();
  await page.waitForTimeout(500);

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(ISSUER_EMAIL);

  const sendBtn = page
    .locator(
      'button[type="submit"], button:has-text("Send"), button:has-text("Continue"), button:has-text("Get Code")',
    )
    .first();
  await sendBtn.click();

  const otpResponse = await page.request.post(`${API}/auth/otp/request`, {
    data: {
      email: ISSUER_EMAIL,
      purpose: "login",
      audience: "issuer_only",
    },
  });
  const { dev_otp } = await otpResponse.json();

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
      const singleInput = page
        .locator('input[maxlength="6"], input[placeholder*="code" i]')
        .first();
      if (await singleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await singleInput.fill(dev_otp);
      }
    }
  }

  await page.waitForTimeout(500);

  const verifyBtn = page
    .locator(
      'button:has-text("Verify"), button:has-text("Sign In"), button[type="submit"]',
    )
    .first();
  if (await verifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    try {
      await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
      await verifyBtn.click();
    } catch {
      // May have auto-submitted
    }
  }

  await page.waitForURL(/\/issuer/, { timeout: 20000 });
}

// ──────────────────────────────────────────
// Recovery Page — Load & Mode Buttons
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Load & Mode Buttons", () => {
  test("recovery page loads with 3 mode buttons", async ({ page }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Page heading
    await expect(page.locator("h1")).toContainText("Token Recovery");

    // 3 mode buttons
    const walletRecoveryBtn = page.locator(
      'button:has-text("ERC-3643 Wallet Recovery")',
    );
    const forceTransferBtn = page.locator(
      'button:has-text("ERC-3643 Force Transfer")',
    );
    const fractionBtn = page.locator('button:has-text("Fraction (ERC-1155)")');

    await expect(walletRecoveryBtn).toBeVisible();
    await expect(forceTransferBtn).toBeVisible();
    await expect(fractionBtn).toBeVisible();
  });
});

// ──────────────────────────────────────────
// Recovery Page — Fraction (ERC-1155) Mode
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Fraction Mode Fields", () => {
  test("selecting Fraction mode shows Sale ID, Fraction ID, and Amount fields", async ({
    page,
  }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Click Fraction mode
    await page.locator('button:has-text("Fraction (ERC-1155)")').click();

    // Sale ID field should be visible (not Token ID)
    const saleIdLabel = page.locator('label:has-text("Sale ID")');
    await expect(saleIdLabel).toBeVisible();
    const tokenIdLabel = page.locator('label:has-text("Token ID")');
    await expect(tokenIdLabel).not.toBeVisible();

    // Fraction ID selector buttons
    const usdcPath = page.locator('button:has-text("ID 1")');
    const otcPath = page.locator('button:has-text("ID 2")');
    await expect(usdcPath).toBeVisible();
    await expect(otcPath).toBeVisible();

    // Amount field
    const amountLabel = page.locator('label:has-text("Amount")');
    await expect(amountLabel).toBeVisible();

    // ONCHAINID should NOT be visible (recovery-only field)
    const onchainLabel = page.locator('label:has-text("ONCHAINID")');
    await expect(onchainLabel).not.toBeVisible();
  });
});

// ──────────────────────────────────────────
// Recovery Page — ERC-3643 Force Transfer Mode
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Force Transfer Mode Fields", () => {
  test("selecting Force Transfer shows Token ID and Amount, hides fraction fields", async ({
    page,
  }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Click Force Transfer mode
    await page.locator('button:has-text("ERC-3643 Force Transfer")').click();

    // Token ID visible
    const tokenIdLabel = page.locator('label:has-text("Token ID")');
    await expect(tokenIdLabel).toBeVisible();

    // Amount visible
    const amountLabel = page.locator('label:has-text("Amount")');
    await expect(amountLabel).toBeVisible();

    // Sale ID should NOT be visible
    const saleIdLabel = page.locator('label:has-text("Sale ID")');
    await expect(saleIdLabel).not.toBeVisible();

    // Fraction ID buttons should NOT be visible
    const fractionLabel = page.locator('label:has-text("Fraction ID")');
    await expect(fractionLabel).not.toBeVisible();

    // ONCHAINID should NOT be visible (recovery-only)
    const onchainLabel = page.locator('label:has-text("ONCHAINID")');
    await expect(onchainLabel).not.toBeVisible();

    // Submit button text
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText("Execute Force Transfer");
  });
});

// ──────────────────────────────────────────
// Recovery Page — Wallet Address Validation
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Wallet Validation", () => {
  test("invalid wallet address shows red border styling", async ({ page }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Type an invalid address in "From Wallet"
    const fromInput = page.locator('input[placeholder="0x..."]').first();
    await fromInput.fill(INVALID_ADDR);

    // The input should have the red border class
    await expect(fromInput).toHaveClass(/border-red-300/);

    // Now type a valid address — red border should disappear
    await fromInput.fill(VALID_ADDR_A);
    await expect(fromInput).not.toHaveClass(/border-red-300/);

    // Same for "To Wallet"
    const toInput = page.locator('input[placeholder="0x..."]').nth(1);
    await toInput.fill(INVALID_ADDR);
    await expect(toInput).toHaveClass(/border-red-300/);

    await toInput.fill(VALID_ADDR_B);
    await expect(toInput).not.toHaveClass(/border-red-300/);
  });
});

// ──────────────────────────────────────────
// Recovery Page — Confirmation Step
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Confirmation Flow", () => {
  test("first submit shows confirmation warning, button text changes", async ({
    page,
  }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Default mode is ERC-3643 Wallet Recovery — fill required fields
    const inputs = page.locator('input[placeholder="0x..."]');
    await inputs.first().fill(VALID_ADDR_A);
    await inputs.nth(1).fill(VALID_ADDR_B);

    // Token ID
    const tokenInput = page.locator('input[placeholder*="UUID of the token"]');
    await tokenInput.fill("00000000-0000-0000-0000-000000000001");

    // Reason
    const reasonArea = page.locator("textarea");
    await reasonArea.fill("E2E test — confirmation flow");

    const submitBtn = page.locator('button[type="submit"]');

    // Before first click — should say "Execute Wallet Recovery"
    await expect(submitBtn).toContainText("Execute Wallet Recovery");

    // Confirmation warning should NOT be visible yet
    const confirmWarning = page.locator(
      "text=Are you sure? This action is irreversible",
    );
    await expect(confirmWarning).not.toBeVisible();

    // First click — triggers confirmation state
    await submitBtn.click();

    // Now the warning banner should appear
    await expect(confirmWarning).toBeVisible();

    // Button text should change
    await expect(submitBtn).toContainText("Click Again to Confirm");
  });
});

// ──────────────────────────────────────────
// Recovery Page — Mode Switch Resets Confirmation
// ──────────────────────────────────────────

test.describe.serial("Recovery Page — Mode Switch Resets State", () => {
  test("switching mode resets the confirmation state", async ({ page }) => {
    await loginAsIssuer(page);
    await page.goto(RECOVERY_URL);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Fill form in default (ERC-3643 Recovery) mode
    const inputs = page.locator('input[placeholder="0x..."]');
    await inputs.first().fill(VALID_ADDR_A);
    await inputs.nth(1).fill(VALID_ADDR_B);

    const tokenInput = page.locator('input[placeholder*="UUID of the token"]');
    await tokenInput.fill("00000000-0000-0000-0000-000000000001");

    const reasonArea = page.locator("textarea");
    await reasonArea.fill("E2E test — mode switch reset");

    // Trigger confirmation
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Confirmation warning should be visible
    const confirmWarning = page.locator(
      "text=Are you sure? This action is irreversible",
    );
    await expect(confirmWarning).toBeVisible();
    await expect(submitBtn).toContainText("Click Again to Confirm");

    // Switch to Force Transfer mode
    await page.locator('button:has-text("ERC-3643 Force Transfer")').click();

    // Confirmation warning should be gone
    await expect(confirmWarning).not.toBeVisible();

    // Submit button should show the default text for force transfer mode
    await expect(submitBtn).toContainText("Execute Force Transfer");

    // Switch to Fraction mode — same reset behavior
    // First trigger confirmation again
    await inputs.first().fill(VALID_ADDR_A);
    await inputs.nth(1).fill(VALID_ADDR_B);
    await tokenInput.fill("00000000-0000-0000-0000-000000000001");
    await reasonArea.fill("test");
    const amountInput = page.locator('input[inputmode="numeric"]');
    await amountInput.fill("1000");
    await submitBtn.click();
    await expect(confirmWarning).toBeVisible();

    // Switch to fraction mode
    await page.locator('button:has-text("Fraction (ERC-1155)")').click();
    await expect(confirmWarning).not.toBeVisible();
    await expect(submitBtn).toContainText("Execute Fraction Recovery");
  });
});
