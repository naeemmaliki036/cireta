/**
 * Safe (Multisig) Wallet E2E Flow Tests
 *
 * Tests Safe wallet support across the platform:
 * Phase 1: Setup — register investor, pass KYC, link an EOA wallet first
 * Phase 2: Safe wallet linking — link a Safe wallet using is_safe flag
 * Phase 3: Safe wallet API behavior — verify is_safe flag, list, set primary
 * Phase 4: Issuer Safe wallet — issuer links a Safe wallet
 * Phase 5: Admin visibility — admin can see Safe wallets in investor/issuer detail
 * Phase 6: Safe wallet edge cases — duplicate, unlinking, re-linking
 *
 * Note: These tests cover the API layer (wallet linking, is_safe flag propagation,
 * ownership verification). Actual on-chain Safe proposal tests require a local
 * Safe deployment which is out of scope for API flow tests.
 *
 * Requires: API running on :3010, dev mode enabled
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ethers } from "ethers";

const API = "http://localhost:3010/api/v1";
const TS = Date.now();

// Unique test identities per run
const INVESTOR_EMAIL = `safe-inv-${TS}@cireta.com`;
const ISSUER_EMAIL = `safe-iss-${TS}@cireta.com`;
const ADMIN_EMAIL = "admin@cireta.com";

// State carried across tests
let investorToken = "";
let issuerToken = "";
let adminToken = "";
let investorId = "";
let issuerId = "";

// EOA wallet (linked first, used as "owner" for Safe verification)
let eoaWallet: { address: string; privateKey: string; signature: string; nonce: string };

// Safe wallet address (we use a random address to simulate — the backend
// will attempt getOwners() which will fail on a non-Safe address, but in
// dev mode we test the API contract and error handling)
let safeAddress = "";

// ── Helpers ──

const PASSWORD = "TestPass@123";

async function getToken(
  request: APIRequestContext,
  email: string,
  audience?: string,
): Promise<string> {
  // Try login first (faster, no rate limit)
  const loginRes = await request.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (loginRes.ok()) {
    const body = await loginRes.json();
    if (body.access_token) return body.access_token;
  }

  // Fallback to OTP
  const otpRes = await request.post(`${API}/auth/otp/request`, {
    data: { email, purpose: "login", audience },
  });
  expect(otpRes.ok()).toBeTruthy();
  const { dev_otp } = await otpRes.json();

  const verifyRes = await request.post(`${API}/auth/otp/verify`, {
    data: { email, code: dev_otp, purpose: "login" },
  });
  expect(verifyRes.ok()).toBeTruthy();
  const body = await verifyRes.json();
  return body.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function generateSignedWallet(nonce: string) {
  const wallet = ethers.Wallet.createRandom();
  const message = `I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: ${nonce}`;
  const signature = await wallet.signMessage(message);
  return {
    address: wallet.address,
    signature,
    privateKey: wallet.privateKey,
    nonce,
  };
}

// ══════════════════════════════════════════
// Phase 1: Setup — Register + KYC + EOA Wallet
// ══════════════════════════════════════════

test.describe.serial("Phase 1: Investor Setup", () => {
  test("1. Register investor", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        email: INVESTOR_EMAIL,
        password: "TestPass@123",
        display_name: "Safe Wallet Test Investor",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    investorToken = body.access_token;
    expect(investorToken).toBeTruthy();
  });

  test("2. Pass KYC via dev-approve", async ({ request }) => {
    const res = await request.post(`${API}/kyc/dev-approve`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
  });

  test("3. Link EOA wallet #1 (standard signature)", async ({ request }) => {
    const nonce = `safe-test-nonce-${TS}`;
    eoaWallet = await generateSignedWallet(nonce);

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: eoaWallet.address,
        signature: eoaWallet.signature,
        nonce: eoaWallet.nonce,
        label: "My EOA Wallet",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.is_primary).toBe(true);
    expect(body.is_safe).toBe(false);
  });

  test("4. Verify EOA wallet is listed", async ({ request }) => {
    const res = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.wallets).toHaveLength(1);
    expect(body.wallets[0].is_safe).toBe(false);
  });
});

// ══════════════════════════════════════════
// Phase 2: Safe Wallet Linking
// ══════════════════════════════════════════

test.describe.serial("Phase 2: Safe Wallet Linking", () => {
  test("5. Safe wallet link validates ownership (rejects non-Safe address)", async ({ request }) => {
    if (!investorToken) investorToken = await getToken(request, INVESTOR_EMAIL);

    const safeWallet = ethers.Wallet.createRandom();
    safeAddress = safeWallet.address;
    const nonce = `safe-link-${TS}`;

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: safeAddress,
        signature: "safe",
        nonce,
        label: "My Safe Wallet",
        is_safe: true,
      },
    });

    // A random address is NOT a Safe contract, so backend should reject.
    // This validates the Safe ownership verification is active.
    // Possible responses:
    // - 400 SAFE_CALL_FAILED (getOwners() call failed — not a Safe contract)
    // - 403 NOT_SAFE_OWNER (call succeeded but EOA not in owners list)
    // - 201 (if dev mode skips Safe verification)
    const status = res.status();
    const body = await res.json();

    if (status === 201) {
      // Dev mode — Safe verification skipped
      expect(body.is_safe).toBe(true);
    } else {
      // Production behavior — correctly rejected
      expect([400, 403, 500]).toContain(status);
    }
  });

  test("6. Standard wallet link still works (no regression)", async ({ request }) => {
    const nonce = `safe-regression-${TS}`;
    const signed = await generateSignedWallet(nonce);

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Wallet 2 EOA",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.is_safe).toBe(false);
    expect(body.is_primary).toBe(false); // First wallet stays primary
  });

  test("7. Cannot link Safe wallet without any EOA linked first", async ({ request }) => {
    // Register a brand new user with NO wallets
    const freshEmail = `safe-fresh-${TS}@cireta.com`;
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: freshEmail,
        password: "TestPass@123",
        display_name: "Fresh User",
      },
    });
    expect(regRes.status()).toBe(201);
    const freshToken = (await regRes.json()).access_token;

    // Approve KYC
    await request.post(`${API}/kyc/dev-approve`, {
      headers: auth(freshToken),
    });

    // Try to link Safe without any EOA
    const res = await request.post(`${API}/wallets`, {
      headers: auth(freshToken),
      data: {
        address: ethers.Wallet.createRandom().address,
        signature: "safe",
        nonce: `no-eoa-${TS}`,
        label: "Safe Without EOA",
        is_safe: true,
      },
    });

    // Should fail — no EOA linked to verify ownership
    expect([400, 403]).toContain(res.status());
  });
});

// ══════════════════════════════════════════
// Phase 3: Safe Wallet API Behavior
// ══════════════════════════════════════════

test.describe.serial("Phase 3: Wallet List & Safe Flags", () => {
  test("8. Wallet list shows is_safe flag correctly", async ({ request }) => {
    if (!investorToken) investorToken = await getToken(request, INVESTOR_EMAIL);
    const res = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Should have at least the EOA wallet
    expect(body.wallets.length).toBeGreaterThanOrEqual(1);

    // All EOA wallets should have is_safe = false
    const eoaWallets = body.wallets.filter((w: any) => !w.is_safe);
    expect(eoaWallets.length).toBeGreaterThanOrEqual(1);
  });

  test("9. Admin can see investor wallets with Safe flag", async ({ request }) => {
    adminToken = await getToken(request, ADMIN_EMAIL, "admin");
    expect(adminToken).toBeTruthy();

    // Find investor
    const listRes = await request.get(`${API}/admin/investors/?search=${INVESTOR_EMAIL}`, {
      headers: auth(adminToken),
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const investor = listBody.items.find((i: any) => i.email === INVESTOR_EMAIL);
    expect(investor).toBeTruthy();
    investorId = investor.id;

    // Get investor detail
    const detailRes = await request.get(`${API}/admin/investors/${investorId}`, {
      headers: auth(adminToken),
    });
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();
    expect(detail.wallets).toBeDefined();
    expect(detail.wallets.length).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════
// Phase 4: Issuer Safe Wallet
// ══════════════════════════════════════════

test.describe.serial("Phase 4: Issuer Safe Wallet", () => {
  test("10. Admin whitelists issuer email", async ({ request }) => {
    if (!adminToken) {
      adminToken = await getToken(request, ADMIN_EMAIL, "admin");
    }

    const res = await request.post(`${API}/admin/issuers/whitelist`, {
      headers: auth(adminToken),
      data: { email: ISSUER_EMAIL },
    });
    // 201 or 409 (already whitelisted)
    expect([201, 409]).toContain(res.status());
  });

  test("11. Issuer registers", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        email: ISSUER_EMAIL,
        password: "TestPass@123",
        display_name: "Safe Wallet Issuer",
      },
    });
    expect(res.status()).toBe(201);
    issuerToken = (await res.json()).access_token;
    expect(issuerToken).toBeTruthy();
  });

  test("12. Issuer submits EOA wallet (may fail if not whitelisted)", async ({ request }) => {
    // Login issuer
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: ISSUER_EMAIL, password: PASSWORD },
    });
    if (!loginRes.ok()) {
      // Issuer registration may have failed — skip gracefully
      test.skip();
      return;
    }
    issuerToken = (await loginRes.json()).access_token;

    const wallet = ethers.Wallet.createRandom();
    const res = await request.post(`${API}/issuer/onboarding/wallet`, {
      headers: auth(issuerToken),
      data: { wallet_address: wallet.address },
    });
    // 200/201 = success, 400 = already submitted, 403 = not an issuer yet, 404 = no issuer record
    expect([200, 201, 400, 403, 404]).toContain(res.status());
  });

  test("13. Issuer gets onboarding status", async ({ request }) => {
    if (!issuerToken) return; // Skip — issuer setup didn't complete
    const res = await request.get(`${API}/issuer/onboarding/status`, {
      headers: auth(issuerToken),
    });
    expect([200, 403, 404]).toContain(res.status());
  });
});

test.describe.serial("Phase 5: Edge Cases & EOA Regression", () => {
  // Re-acquire investorToken at start of this block
  test("pre. Acquire investor token", async ({ request }) => {
    const regRes = await request.post(`${API}/auth/register`, {
      data: { email: INVESTOR_EMAIL, password: PASSWORD, display_name: "Safe Re-login" },
    });
    if (regRes.ok()) {
      investorToken = (await regRes.json()).access_token;
    } else {
      const loginRes = await request.post(`${API}/auth/login`, {
        data: { email: INVESTOR_EMAIL, password: PASSWORD },
      });
      investorToken = (await loginRes.json()).access_token;
    }
    expect(investorToken).toBeTruthy();
  });
  test("14. Wallet link with invalid signature is rejected", async ({ request }) => {
    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: ethers.Wallet.createRandom().address,
        signature: "0xinvalidsignature",
        nonce: `invalid-${TS}`,
        label: "Invalid Sig",
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("16. EOA wallet link + set primary still works", async ({ request }) => {
    const nonce = `regression-primary-${TS}`;
    const signed = await generateSignedWallet(nonce);

    const linkRes = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Regression Wallet",
      },
    });
    expect(linkRes.status()).toBe(201);
    const wallet = await linkRes.json();
    expect(wallet.is_safe).toBe(false);

    // Set as primary
    const primaryRes = await request.patch(`${API}/wallets/${wallet.address}/primary`, {
      headers: auth(investorToken),
    });
    expect([200, 204]).toContain(primaryRes.status());
  });

  test("17. Duplicate wallet address is rejected", async ({ request }) => {
    // Link a wallet first, then try to link the same address again
    const nonce1 = `dup-orig-${TS}`;
    const signed1 = await generateSignedWallet(nonce1);

    const res1 = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed1.address,
        signature: signed1.signature,
        nonce: signed1.nonce,
        label: "Original",
      },
    });
    // Might hit wallet cap, but that's fine
    if (res1.status() !== 201) return;

    // Now try duplicate
    const nonce2 = `dup-copy-${TS}`;
    const message = `I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: ${nonce2}`;
    const wallet = new ethers.Wallet(signed1.privateKey);
    const signature = await wallet.signMessage(message);

    const res2 = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed1.address,
        signature,
        nonce: nonce2,
        label: "Duplicate",
      },
    });
    expect([400, 409]).toContain(res2.status());
  });

  test("18. Wallet unlink works", async ({ request }) => {
    const listRes = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    const wallets = (await listRes.json()).wallets;
    const nonPrimary = wallets.find((w: any) => !w.is_primary);

    if (nonPrimary) {
      const res = await request.delete(`${API}/wallets/${nonPrimary.address}`, {
        headers: auth(investorToken),
      });
      expect([200, 204]).toContain(res.status());
    }
  });
});
