/**
 * API E2E Flow Tests
 *
 * Tests the full API lifecycle: auth → tokens → sales → compliance
 * Requires: API running on :3010
 */
import { test, expect } from "@playwright/test";

const API = "http://localhost:3010/api/v1";

// Test accounts
const ADMIN_EMAIL = "admin@cireta.com";
const ISSUER_EMAIL = "issuer@cireta.com";
const INVESTOR_EMAIL = "naeem+01@vanarchain.com";
const NEW_INVESTOR_EMAIL = `test-investor-${Date.now()}@cireta.com`;

let adminToken = "";
let issuerToken = "";
let investorToken = "";

/** Token cache to avoid OTP rate limits */
const tokenCache: Record<string, string> = {};

/** Helper: login via OTP and return access_token (cached) */
async function getToken(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
  email: string,
  audience?: string,
): Promise<string> {
  const cacheKey = `${email}:${audience}`;
  if (tokenCache[cacheKey]) return tokenCache[cacheKey];

  const otpRes = await request.post(`${API}/auth/otp/request`, {
    data: { email, purpose: "login", audience },
  });
  const { dev_otp } = await otpRes.json();
  const verifyRes = await request.post(`${API}/auth/otp/verify`, {
    data: { email, code: dev_otp, purpose: "login" },
  });
  const body = await verifyRes.json();
  tokenCache[cacheKey] = body.access_token;
  return body.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ──────────────────────────────────────────
// Health
// ──────────────────────────────────────────

test.describe("Health", () => {
  test("liveness check", async ({ request }) => {
    const res = await request.get(`${API}/health/live`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("readiness check", async ({ request }) => {
    const res = await request.get(`${API}/health/ready`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

// ──────────────────────────────────────────
// Auth Flow
// ──────────────────────────────────────────

test.describe.serial("Auth Flow", () => {
  test("OTP request for admin", async ({ request }) => {
    const res = await request.post(`${API}/auth/otp/request`, {
      data: { email: ADMIN_EMAIL, purpose: "login", audience: "platform_admin" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("sent");
    expect(body.dev_otp).toBeDefined();
  });

  test("OTP verify — admin login", async ({ request }) => {
    const otpRes = await request.post(`${API}/auth/otp/request`, {
      data: { email: ADMIN_EMAIL, purpose: "login", audience: "platform_admin" },
    });
    const { dev_otp } = await otpRes.json();
    expect(dev_otp).toBeDefined();

    const verifyRes = await request.post(`${API}/auth/otp/verify`, {
      data: { email: ADMIN_EMAIL, code: dev_otp, purpose: "login" },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const body = await verifyRes.json();
    expect(body.access_token).toBeDefined();
    expect(body.role).toBe("admin");
    adminToken = body.access_token;
  });

  test("OTP verify — issuer login", async ({ request }) => {
    const otpRes = await request.post(`${API}/auth/otp/request`, {
      data: { email: ISSUER_EMAIL, purpose: "login", audience: "issuer_only" },
    });
    const { dev_otp } = await otpRes.json();

    const verifyRes = await request.post(`${API}/auth/otp/verify`, {
      data: { email: ISSUER_EMAIL, code: dev_otp, purpose: "login" },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const body = await verifyRes.json();
    expect(body.access_token).toBeDefined();
    expect(body.role).toBe("issuer");
    issuerToken = body.access_token;
  });

  test("OTP verify — investor login", async ({ request }) => {
    const otpRes = await request.post(`${API}/auth/otp/request`, {
      data: { email: INVESTOR_EMAIL, purpose: "login", audience: "investor" },
    });
    const { dev_otp } = await otpRes.json();

    const verifyRes = await request.post(`${API}/auth/otp/verify`, {
      data: { email: INVESTOR_EMAIL, code: dev_otp, purpose: "login" },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const body = await verifyRes.json();
    expect(body.access_token).toBeDefined();
    expect(body.role).toBe("investor");
    investorToken = body.access_token;
  });

  test("OTP request fails for wrong audience", async ({ request }) => {
    const res = await request.post(`${API}/auth/otp/request`, {
      data: { email: ADMIN_EMAIL, purpose: "login", audience: "investor" },
    });
    expect(res.status()).toBe(403);
  });

  test("OTP request fails for non-existent user", async ({ request }) => {
    const res = await request.post(`${API}/auth/otp/request`, {
      data: { email: "nobody@cireta.com", purpose: "login" },
    });
    expect(res.status()).toBe(404);
  });

  test("OTP verify fails with wrong code", async ({ request }) => {
    const res = await request.post(`${API}/auth/otp/verify`, {
      data: { email: ADMIN_EMAIL, code: "000000", purpose: "login" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("register new investor via OTP", async ({ request }) => {
    const otpRes = await request.post(`${API}/auth/otp/request`, {
      data: { email: NEW_INVESTOR_EMAIL, purpose: "register" },
    });
    expect(otpRes.ok()).toBeTruthy();
    const { dev_otp } = await otpRes.json();

    const verifyRes = await request.post(`${API}/auth/otp/verify`, {
      data: { email: NEW_INVESTOR_EMAIL, code: dev_otp, purpose: "register", display_name: "Test Investor" },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const body = await verifyRes.json();
    expect(body.access_token).toBeDefined();
    expect(body.role).toBe("investor");
  });

  test("duplicate registration fails", async ({ request }) => {
    const res = await request.post(`${API}/auth/otp/request`, {
      data: { email: NEW_INVESTOR_EMAIL, purpose: "register" },
    });
    expect(res.status()).toBe(409);
  });
});

// ──────────────────────────────────────────
// Auth — Protected Routes
// ──────────────────────────────────────────

test.describe("Protected Routes", () => {
  test("GET /auth/me without token returns 401", async ({ request }) => {
    const res = await request.get(`${API}/auth/me`);
    expect(res.status()).toBe(401);
  });

  test("GET /auth/me with admin token", async ({ request }) => {
    const token = await getToken(request, ADMIN_EMAIL, "platform_admin");
    const res = await request.get(`${API}/auth/me`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.email).toBe(ADMIN_EMAIL);
  });

  test("GET /auth/me with issuer token", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/auth/me`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.email).toBe(ISSUER_EMAIL);
  });
});

// ──────────────────────────────────────────
// Tokens
// ──────────────────────────────────────────

let tokenId = "";

test.describe("Tokens", () => {
  test("token list returns data", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/tokens/`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBeTruthy();
    if (body.items.length > 0) {
      tokenId = body.items[0].id;
    }
  });

  test("token detail", async ({ request }) => {
    if (!tokenId) test.skip();
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/tokens/${tokenId}`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBe(tokenId);
    expect(body.name).toBeDefined();
    expect(body.symbol).toBeDefined();
  });

  test("check-symbol endpoint", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/tokens/check-symbol?symbol=WGLD&name=TestGold`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.symbol_exists).toBe("boolean");
  });
});

// ──────────────────────────────────────────
// Sales
// ──────────────────────────────────────────

let saleId = "";

test.describe.serial("Sales", () => {
  test("public sales list", async ({ request }) => {
    const res = await request.get(`${API}/sales`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test("issuer can list own sales", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/issuer/sales`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test("issuer can create a draft sale", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.post(`${API}/sales`, {
      headers: auth(token),
      data: {
        title: `E2E Test Sale ${Date.now()}`,
        description: "Automated test sale",
        sale_mode: "direct",
        sale_structure: "phase_allocated",
        is_coming_soon: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("draft");
    saleId = body.id;
  });

  test("issuer can get sale detail", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBe(saleId);
  });

  test("issuer can update sale", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.patch(`${API}/sales/${saleId}`, {
      headers: auth(token),
      data: { description: "Updated by E2E test" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.description_text).toBe("Updated by E2E test");
  });

  test("issuer can add team member", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.post(`${API}/sales/${saleId}/team`, {
      headers: auth(token),
      data: { name: "Test Member", title: "CTO", bio: "Test bio" },
    });
    expect(res.status()).toBe(201);
  });

  test("issuer can add FAQ", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.post(`${API}/sales/${saleId}/faqs`, {
      headers: auth(token),
      data: { question: "What is this?", answer: "A test sale." },
    });
    expect(res.status()).toBe(201);
  });

  test("issuer can add image", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.post(`${API}/sales/${saleId}/images`, {
      headers: auth(token),
      data: { url: "https://example.com/test.jpg", caption: "Test image", is_banner: true },
    });
    expect(res.status()).toBe(201);
  });

  test("issuer can add document", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.post(`${API}/sales/${saleId}/documents`, {
      headers: auth(token),
      data: { name: "Test Doc", doc_type: "legal", url: "https://example.com/doc.pdf" },
    });
    expect(res.status()).toBe(201);
  });

  test("investor cannot create sale", async ({ request }) => {
    const token = await getToken(request, INVESTOR_EMAIL, "investor");
    const res = await request.post(`${API}/sales`, {
      headers: auth(token),
      data: {
        title: "Hacker Sale",
        description: "Should fail",
        sale_mode: "direct",
        sale_structure: "phase_allocated",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

// ──────────────────────────────────────────
// Admin endpoints
// ──────────────────────────────────────────

test.describe("Admin Endpoints", () => {
  test("admin can list all sales", async ({ request }) => {
    const token = await getToken(request, ADMIN_EMAIL, "platform_admin");
    const res = await request.get(`${API}/admin/sales`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test("admin can list investors", async ({ request }) => {
    const token = await getToken(request, ADMIN_EMAIL, "platform_admin");
    const res = await request.get(`${API}/admin/investors/`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test("admin can list issuers", async ({ request }) => {
    const token = await getToken(request, ADMIN_EMAIL, "platform_admin");
    const res = await request.get(`${API}/admin/issuers/`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test("investor cannot access admin endpoints", async ({ request }) => {
    const token = await getToken(request, INVESTOR_EMAIL, "investor");
    const res = await request.get(`${API}/admin/sales`, { headers: auth(token) });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

// ──────────────────────────────────────────
// Issuer endpoints
// ──────────────────────────────────────────

test.describe("Issuer Endpoints", () => {
  test("issuer sales listing", async ({ request }) => {
    const token = await getToken(request, ISSUER_EMAIL, "issuer_only");
    const res = await request.get(`${API}/issuer/sales`, { headers: auth(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items).toBeDefined();
  });
});

// ──────────────────────────────────────────
// Upload
// ──────────────────────────────────────────

test.describe("File Upload", () => {
  test("upload endpoint requires auth", async ({ request }) => {
    const res = await request.post(`${API}/uploads/`);
    // Either 401 (auth required) or 405 (method not allowed) or 422 (missing file)
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
