/**
 * KYC Automation + Wallet Addition E2E Flow Tests
 *
 * Tests the complete KYC verification and wallet management lifecycle:
 * Phase 1: Investor registration + KYC approval via dev-bypass
 * Phase 2: Wallet linking with real ECDSA signatures, CRUD, primary management
 * Phase 3: Wallet cap enforcement + edge cases (max 10, duplicates, invalid sig)
 * Phase 4: Admin KYC management (approve, reject, reset, on-chain registration)
 *
 * Requires: API running on :3010, dev mode enabled (for dev_otp + dev-approve)
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ethers } from "ethers";

const API = "http://localhost:3010/api/v1";
const TS = Date.now();

// Unique test identities per run
const INVESTOR_EMAIL = `investor-kyc-${TS}@cireta.com`;
const INVESTOR2_EMAIL = `investor-kyc2-${TS}@cireta.com`;
const ADMIN_EMAIL = "admin@cireta.com";

// State carried across tests
let investorToken = "";
let investor2Token = "";
let adminToken = "";
let investorId = "";
let investor2Id = "";

// Wallet keypairs generated per test run
const walletKeys: { address: string; privateKey: string }[] = [];

// ── Helpers ──

async function getToken(
  request: APIRequestContext,
  email: string,
  audience?: string
): Promise<string> {
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

/** Generate a fresh ethers wallet and sign the Cireta link message. */
async function generateSignedWallet(nonce: string): Promise<{
  address: string;
  signature: string;
  privateKey: string;
  nonce: string;
}> {
  const wallet = ethers.Wallet.createRandom();
  const message = `Link wallet to Cireta account: ${nonce}`;
  const signature = await wallet.signMessage(message);
  return {
    address: wallet.address,
    signature,
    privateKey: wallet.privateKey,
    nonce,
  };
}

// ══════════════════════════════════════════
// Phase 1: Investor Registration + KYC Flow
// ══════════════════════════════════════════

test.describe.serial("Phase 1: KYC Verification Flow", () => {
  test("1. Register fresh investor", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        email: INVESTOR_EMAIL,
        password: "TestPass@123",
        display_name: "KYC Test Investor",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    investorToken = body.access_token;
    expect(investorToken).toBeTruthy();
  });

  test("2. KYC status is none initially", async ({ request }) => {
    const res = await request.get(`${API}/kyc/status`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("none");
    expect(body.level).toBe(0);
  });

  test("3. Investor passes KYC via dev-approve", async ({ request }) => {
    const res = await request.post(`${API}/kyc/dev-approve`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.kyc_level).toBe(2);
  });

  test("4. KYC status confirms approved", async ({ request }) => {
    const res = await request.get(`${API}/kyc/status`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.level).toBe(2);
  });

  test("5. Admin logs in", async ({ request }) => {
    adminToken = await getToken(request, ADMIN_EMAIL, "admin");
    expect(adminToken).toBeTruthy();
  });

  test("6. Admin can see investor with approved KYC", async ({ request }) => {
    const res = await request.get(
      `${API}/admin/investors/?kyc_status=approved`,
      { headers: auth(adminToken) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const investor = body.items.find(
      (i: any) => i.email === INVESTOR_EMAIL
    );
    expect(investor).toBeTruthy();
    expect(investor.kyc_status).toBe("approved");
    expect(investor.kyc_level).toBe(2);
    investorId = investor.id;
  });

  test("7. Admin views investor detail", async ({ request }) => {
    const res = await request.get(`${API}/admin/investors/${investorId}`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.kyc_status).toBe("approved");
    expect(body.kyc_level).toBe(2);
    expect(body.email).toBe(INVESTOR_EMAIL);
  });
});

// ══════════════════════════════════════════
// Phase 2: Wallet Management
// ══════════════════════════════════════════

test.describe.serial("Phase 2: Wallet Linking & Management", () => {
  test("8. No wallets initially", async ({ request }) => {
    if (!investorToken) {
      investorToken = await getToken(request, INVESTOR_EMAIL, "investor");
    }
    const res = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.wallets).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test("9. Link wallet #1 with signature (becomes primary)", async ({
    request,
  }) => {
    const nonce = `nonce-${TS}-1`;
    const signed = await generateSignedWallet(nonce);
    walletKeys.push({ address: signed.address, privateKey: signed.privateKey });

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Wallet 1",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.is_primary).toBe(true);
    expect(body.address.toLowerCase()).toBe(signed.address.toLowerCase());
    expect(body.label).toBe("Wallet 1");
  });

  test("10. Link wallet #2 (not primary)", async ({ request }) => {
    const nonce = `nonce-${TS}-2`;
    const signed = await generateSignedWallet(nonce);
    walletKeys.push({ address: signed.address, privateKey: signed.privateKey });

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Wallet 2",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.is_primary).toBe(false);
  });

  test("11. Link wallet #3", async ({ request }) => {
    const nonce = `nonce-${TS}-3`;
    const signed = await generateSignedWallet(nonce);
    walletKeys.push({ address: signed.address, privateKey: signed.privateKey });

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Wallet 3",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("12. List shows 3 wallets with correct primary", async ({
    request,
  }) => {
    const res = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.wallets).toHaveLength(3);

    const primary = body.wallets.filter((w: any) => w.is_primary);
    expect(primary).toHaveLength(1);
    expect(primary[0].address.toLowerCase()).toBe(
      walletKeys[0].address.toLowerCase()
    );
  });

  test("13. Set wallet #2 as primary", async ({ request }) => {
    const addr = walletKeys[1].address;
    const res = await request.patch(`${API}/wallets/${addr}/primary`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.is_primary).toBe(true);
    expect(body.address.toLowerCase()).toBe(addr.toLowerCase());
  });

  test("14. Cannot remove primary wallet", async ({ request }) => {
    const addr = walletKeys[1].address; // now primary
    const res = await request.delete(`${API}/wallets/${addr}`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail.code).toBe("PRIMARY_WALLET");
  });

  test("15. Remove non-primary wallet #1", async ({ request }) => {
    const addr = walletKeys[0].address; // no longer primary
    const res = await request.delete(`${API}/wallets/${addr}`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(204);
  });

  test("16. List shows 2 wallets after removal", async ({ request }) => {
    const res = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.wallets).toHaveLength(2);
  });
});

// ══════════════════════════════════════════
// Phase 3: Wallet Cap + Edge Cases
// ══════════════════════════════════════════

test.describe.serial("Phase 3: Wallet Cap & Edge Cases", () => {
  test("17. Link wallets up to max (10 total)", async ({ request }) => {
    test.setTimeout(180_000); // 8 wallets × ~10s each with screening
    if (!investorToken) {
      investorToken = await getToken(request, INVESTOR_EMAIL, "investor");
    }

    // Currently have 2 wallets (indices 1,2 in walletKeys — 0 was removed)
    // Need 8 more to reach 10
    for (let i = 4; i <= 11; i++) {
      const nonce = `nonce-${TS}-${i}`;
      const signed = await generateSignedWallet(nonce);
      walletKeys.push({
        address: signed.address,
        privateKey: signed.privateKey,
      });

      const res = await request.post(`${API}/wallets`, {
        headers: auth(investorToken),
        data: {
          address: signed.address,
          signature: signed.signature,
          nonce: signed.nonce,
          label: `Wallet ${i}`,
        },
      });
      expect(res.status()).toBe(201);
    }

    // Verify we have 10
    const listRes = await request.get(`${API}/wallets`, {
      headers: auth(investorToken),
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.total).toBe(10);
  });

  test("18. 11th wallet rejected — MAX_WALLETS_REACHED", async ({
    request,
  }) => {
    const nonce = `nonce-${TS}-overflow`;
    const signed = await generateSignedWallet(nonce);

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail.code).toBe("MAX_WALLETS_REACHED");
    expect(body.detail.message).toContain("10");
  });

  test("19. Duplicate wallet rejected — WALLET_EXISTS", async ({
    request,
  }) => {
    // Try to link wallet #2 again (still in the account)
    const existingAddr = walletKeys[1].address;
    const wallet = new ethers.Wallet(walletKeys[1].privateKey);
    const nonce = `nonce-${TS}-dup`;
    const message = `Link wallet to Cireta account: ${nonce}`;
    const signature = await wallet.signMessage(message);

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: existingAddr,
        signature,
        nonce,
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.detail.code).toBe("WALLET_EXISTS");
  });

  test("20. Invalid signature rejected — INVALID_SIGNATURE", async ({
    request,
  }) => {
    // Generate a wallet but sign with a DIFFERENT wallet's key
    const targetWallet = ethers.Wallet.createRandom();
    const signerWallet = ethers.Wallet.createRandom();
    const nonce = `nonce-${TS}-badsig`;
    const message = `Link wallet to Cireta account: ${nonce}`;
    const signature = await signerWallet.signMessage(message);

    const res = await request.post(`${API}/wallets`, {
      headers: auth(investorToken),
      data: {
        address: targetWallet.address, // address of wallet A
        signature, // signed by wallet B
        nonce,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail.code).toBe("INVALID_SIGNATURE");
  });

  test("21. Invalid address format rejected", async ({ request }) => {
    const res = await request.delete(`${API}/wallets/not-an-address`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail.code).toBe("INVALID_ADDRESS");
  });
});

// ══════════════════════════════════════════
// Phase 4: Admin KYC Management
// ══════════════════════════════════════════

test.describe.serial("Phase 4: Admin KYC Management", () => {
  test("22. Register second investor for admin tests", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        email: INVESTOR2_EMAIL,
        password: "TestPass@123",
        display_name: "KYC Admin Test Investor",
      },
    });
    expect(res.status()).toBe(201);
    investor2Token = (await res.json()).access_token;
    expect(investor2Token).toBeTruthy();

    // Verify KYC is none
    const statusRes = await request.get(`${API}/kyc/status`, {
      headers: auth(investor2Token),
    });
    expect(statusRes.status()).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.status).toBe("none");
  });

  test("23. Admin logs in", async ({ request }) => {
    if (!adminToken) {
      adminToken = await getToken(request, ADMIN_EMAIL, "admin");
    }
    expect(adminToken).toBeTruthy();
  });

  test("24. Admin finds second investor", async ({ request }) => {
    const res = await request.get(`${API}/admin/investors/`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const inv = body.items.find((i: any) => i.email === INVESTOR2_EMAIL);
    expect(inv).toBeTruthy();
    investor2Id = inv.id;
  });

  test("25. Admin approves KYC for investor 2", async ({ request }) => {
    const res = await request.patch(
      `${API}/admin/investors/${investor2Id}/kyc`,
      {
        headers: auth(adminToken),
        data: { kyc_status: "approved", reason: "E2E test approval" },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.kyc_status).toBe("approved");
    expect(body.kyc_level).toBe(2);
  });

  test("26. Investor 2 confirms approved KYC status", async ({ request }) => {
    const res = await request.get(`${API}/kyc/status`, {
      headers: auth(investor2Token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.level).toBe(2);
  });

  test("27. Admin rejects KYC for investor 2", async ({ request }) => {
    const res = await request.patch(
      `${API}/admin/investors/${investor2Id}/kyc`,
      {
        headers: auth(adminToken),
        data: { kyc_status: "rejected", reason: "E2E test rejection" },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.kyc_status).toBe("rejected");
    expect(body.kyc_level).toBe(0);
  });

  test("28. Investor 2 sees rejected status", async ({ request }) => {
    const res = await request.get(`${API}/kyc/status`, {
      headers: auth(investor2Token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejected");
    expect(body.level).toBe(0);
  });

  test("29. Admin resets KYC to none", async ({ request }) => {
    const res = await request.patch(
      `${API}/admin/investors/${investor2Id}/kyc`,
      {
        headers: auth(adminToken),
        data: { kyc_status: "none" },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.kyc_status).toBe("none");
    expect(body.kyc_level).toBe(0);
  });

  test("30. Admin re-approves and triggers on-chain registration", async ({
    request,
  }) => {
    // First approve
    const approveRes = await request.patch(
      `${API}/admin/investors/${investor2Id}/kyc`,
      {
        headers: auth(adminToken),
        data: { kyc_status: "approved" },
      }
    );
    expect(approveRes.status()).toBe(200);

    // Link a wallet for investor 2 so on-chain registration has a target
    const nonce = `nonce-${TS}-inv2`;
    const signed = await generateSignedWallet(nonce);

    const walletRes = await request.post(`${API}/wallets`, {
      headers: auth(investor2Token),
      data: {
        address: signed.address,
        signature: signed.signature,
        nonce: signed.nonce,
        label: "Investor 2 Wallet",
      },
    });
    expect(walletRes.status()).toBe(201);

    // Trigger on-chain registration
    const onchainRes = await request.post(
      `${API}/admin/investors/${investor2Id}/kyc/register-onchain`,
      { headers: auth(adminToken) }
    );
    // May succeed or fail depending on chain availability — both are valid
    const onchainStatus = onchainRes.status();
    if (onchainStatus === 200) {
      const body = await onchainRes.json();
      expect(body.status).toBe("registered");
    } else {
      // On-chain not available in test env — 500 is acceptable
      expect([500, 502]).toContain(onchainStatus);
    }
  });

  test("31. Non-approved user cannot trigger on-chain registration", async ({
    request,
  }) => {
    // Reset investor 2 to none first
    await request.patch(`${API}/admin/investors/${investor2Id}/kyc`, {
      headers: auth(adminToken),
      data: { kyc_status: "none" },
    });

    const res = await request.post(
      `${API}/admin/investors/${investor2Id}/kyc/register-onchain`,
      { headers: auth(adminToken) }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail.code).toBe("NOT_APPROVED");
  });

  test("32. Investor cannot access admin KYC endpoints", async ({
    request,
  }) => {
    // Re-auth investor (token may have expired during long test run)
    investorToken = await getToken(request, INVESTOR_EMAIL, "investor");

    const res = await request.patch(
      `${API}/admin/investors/${investor2Id}/kyc`,
      {
        headers: auth(investorToken),
        data: { kyc_status: "approved" },
      }
    );
    expect(res.status()).toBe(403);
  });
});
