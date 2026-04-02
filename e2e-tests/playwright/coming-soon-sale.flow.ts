/**
 * Coming Soon Sale Flow Test
 *
 * Creates a sale with is_coming_soon=true — no token or on-chain deployment needed.
 * Flow:
 * 1. Admin logs in
 * 2. Admin whitelists issuer email
 * 3. Issuer registers, submits wallet, admin approves + activates
 * 4. Issuer creates coming-soon sale (no token_id, no phases)
 * 5. Issuer adds content (team, FAQ, social links)
 * 6. Issuer submits sale for approval
 * 7. Admin approves → status becomes APPROVED_COMING_SOON
 * 8. Public can view the sale on launchpad
 * 9. Investor registers, sees the sale, cannot contribute
 *
 * Requires: API on :3010, seeded DB (admin@cireta.com exists)
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3010/api/v1";
const TS = Date.now();

const ISSUER_EMAIL = `issuer-cs-${TS}@cireta.com`;
const INVESTOR_EMAIL = `investor-cs-${TS}@cireta.com`;
const PASSWORD = "TestPass@123";

let adminToken: string;
let issuerToken: string;
let investorToken: string;
let issuerId: string;
let saleId: string;

// ── Helpers ──

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Tests ──

test.describe.serial("Coming Soon Sale Flow", () => {
  // ── Phase 1: Admin + Issuer Setup ──

  test("1. Admin logs in", async ({ request }) => {
    adminToken = await login(request, "admin@cireta.com", "Cireta26");
    expect(adminToken).toBeTruthy();
  });

  test("2. Admin whitelists issuer email", async ({ request }) => {
    const res = await request.post(`${API}/admin/issuers/whitelist`, {
      headers: auth(adminToken),
      data: { email: ISSUER_EMAIL, issuer_type: "individual" },
    });
    expect(res.status()).toBe(201);
  });

  test("3. Issuer registers", async ({ request }) => {
    const res = await request.post(`${API}/auth/register/issuer`, {
      data: {
        email: ISSUER_EMAIL,
        password: PASSWORD,
        display_name: "Coming Soon Issuer",
      },
    });
    expect(res.status()).toBe(201);
    issuerToken = (await res.json()).access_token;
    expect(issuerToken).toBeTruthy();
  });

  test("4. Admin finds and activates issuer", async ({ request }) => {
    // Find issuer
    const listRes = await request.get(`${API}/admin/issuers/`, {
      headers: auth(adminToken),
    });
    expect(listRes.status()).toBe(200);
    const issuer = (await listRes.json()).items.find(
      (i: any) => i.slug?.includes("issuer-cs") || i.name?.includes("Coming Soon Issuer")
    );
    expect(issuer).toBeTruthy();
    issuerId = issuer.id;

    // Submit wallet
    const walletRes = await request.post(`${API}/issuer/wallet`, {
      headers: auth(issuerToken),
      data: { wallet_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
    });
    expect(walletRes.status()).toBe(200);

    // Approve wallet
    const approveWallet = await request.post(
      `${API}/admin/issuers/${issuerId}/approve-wallet`,
      { headers: auth(adminToken) }
    );
    expect(approveWallet.status()).toBe(200);

    // Skip identity
    const skipId = await request.post(
      `${API}/admin/issuers/${issuerId}/skip-identity`,
      { headers: auth(adminToken) }
    );
    expect(skipId.status()).toBe(200);

    // Activate
    const activate = await request.post(
      `${API}/admin/issuers/${issuerId}/activate`,
      { headers: auth(adminToken) }
    );
    expect(activate.status()).toBe(200);
    expect((await activate.json()).status).toBe("active");
  });

  // ── Phase 2: Coming Soon Sale ──

  test("5. Issuer creates coming-soon sale (no token, no phases)", async ({
    request,
  }) => {
    const res = await request.post(`${API}/sales/`, {
      headers: auth(issuerToken),
      data: {
        title: `Gold Reserve Fund — Coming ${TS}`,
        description: "Premium gold-backed commodity token launching Q3 2026",
        full_description:
          "The Gold Reserve Fund tokenizes fractional ownership of physical gold reserves stored in Swiss vaults. Each token represents a verified claim on allocated gold bullion.",
        is_coming_soon: true,
        sale_mode: "vested",
        sale_structure: "phase_allocated",
        website_url: "https://example.com/gold-fund",
        twitter_url: "https://twitter.com/goldfund",
        telegram_url: "https://t.me/goldfund",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    saleId = body.id;
    expect(saleId).toBeTruthy();
    expect(body.is_coming_soon).toBe(true);
    expect(body.status).toBe("draft");
  });

  test("6. Issuer adds team member", async ({ request }) => {
    const res = await request.post(`${API}/sales/${saleId}/team`, {
      headers: auth(issuerToken),
      data: {
        name: "Alice Goldstein",
        title: "Managing Director",
        bio: "20 years in commodity trading and precious metals markets",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("7. Issuer adds FAQ", async ({ request }) => {
    const res = await request.post(`${API}/sales/${saleId}/faqs`, {
      headers: auth(issuerToken),
      data: {
        question: "When will the sale go live?",
        answer: "The public sale is expected to launch in Q3 2026. Join our Telegram for updates.",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("8. Issuer submits sale for approval", async ({ request }) => {
    const res = await request.post(
      `${API}/sales/${saleId}/submit-for-approval`,
      { headers: auth(issuerToken) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending_approval");
  });

  test("9. Admin approves → APPROVED_COMING_SOON", async ({ request }) => {
    const res = await request.post(
      `${API}/admin/sales/${saleId}/approve`,
      { headers: auth(adminToken) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved_coming_soon");
    expect(body.message).toContain("Coming Soon");
  });

  // ── Phase 3: Public Visibility ──

  test("10. Public can view the coming-soon sale", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(saleId);
    expect(body.is_coming_soon).toBe(true);
    expect(body.status).toBe("approved_coming_soon");
    expect(body.title).toContain("Gold Reserve Fund");
  });

  test("11. Public can view team members", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/team`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].name).toBe("Alice Goldstein");
  });

  test("12. Public can view FAQs", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/faqs`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].question).toContain("When will the sale go live");
  });

  test("13. Coming-soon sale appears in public sale list", async ({
    request,
  }) => {
    const res = await request.get(`${API}/sales/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.items.find((s: any) => s.id === saleId);
    expect(found).toBeTruthy();
    expect(found.is_coming_soon).toBe(true);
  });

  // ── Phase 4: Investor Cannot Contribute ──

  test("14. Investor registers", async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: {
        email: INVESTOR_EMAIL,
        password: PASSWORD,
        display_name: "CS Investor",
      },
    });
    expect(res.status()).toBe(201);
    investorToken = (await res.json()).access_token;
    expect(investorToken).toBeTruthy();
  });

  test("15. Investor passes KYC via dev bypass", async ({ request }) => {
    const res = await request.post(`${API}/kyc/dev-approve`, {
      headers: auth(investorToken),
    });
    expect(res.status()).toBe(200);
  });

  test("16. Investor cannot contribute to coming-soon sale", async ({
    request,
  }) => {
    const res = await request.post(`${API}/sales/${saleId}/contribute`, {
      headers: auth(investorToken),
      data: {
        amount: "100",
        tx_hash: "0x" + "b".repeat(64),
      },
    });
    // Should be rejected — sale is coming soon, not active
    expect([400, 403, 404]).toContain(res.status());
  });

  // ── Phase 5: Admin Oversight ──

  test("17. Admin sees the sale in admin list", async ({ request }) => {
    const res = await request.get(`${API}/admin/sales/`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.items.find((s: any) => s.id === saleId);
    expect(found).toBeTruthy();
    expect(found.status).toBe("approved_coming_soon");
  });
});
