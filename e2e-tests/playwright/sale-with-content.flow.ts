/**
 * Sale With Full Content Flow Test
 *
 * Sets up a complete sale with gallery images, video, team, FAQ,
 * documents, rich description — then approves it.
 *
 * Uses seeded issuer (issuer@cireta.com) — no on-chain needed.
 *
 * Requires: API on :3010, seeded DB
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3010/api/v1";

let adminToken: string;
let issuerToken: string;
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

async function loginOtp(
  request: APIRequestContext,
  email: string
): Promise<string> {
  const reqRes = await request.post(`${API}/auth/otp/request`, {
    data: { email, purpose: "login" },
  });
  expect(reqRes.status()).toBe(200);
  const { dev_otp } = await reqRes.json();

  const verifyRes = await request.post(`${API}/auth/otp/verify`, {
    data: { email, code: dev_otp, purpose: "login" },
  });
  expect(verifyRes.status()).toBe(200);
  return (await verifyRes.json()).access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Tests ──

test.describe.serial("Sale With Full Content", () => {
  // ── Auth ──

  test("1. Admin and issuer log in", async ({ request }) => {
    adminToken = await login(request, "admin@cireta.com", "Cireta26");
    issuerToken = await loginOtp(request, "issuer@cireta.com");
    expect(adminToken).toBeTruthy();
    expect(issuerToken).toBeTruthy();
  });

  // ── Create Sale ──

  test("2. Issuer creates coming-soon sale with rich content", async ({
    request,
  }) => {
    const res = await request.post(`${API}/sales/`, {
      headers: auth(issuerToken),
      data: {
        title: "Copper Cathode from Tanzania",
        description:
          "Tokenized copper mining venture in Tanzania's Mpwapwa District",
        full_description:
          "<h2>The Kinusi Copper Mining Project</h2><p>A large-scale, tokenized copper venture backed by <strong>5M+ tons</strong> of verified reserves. Each KCU = 1 kg of verified copper cathode (99.97%–99.99% purity), priced at $5 FOB Tanzania.</p><ul><li>Up to 45% below LME pricing</li><li>12-month delivery cycle</li><li>Blockchain transparency</li></ul>",
        is_coming_soon: true,
        sale_mode: "vested",
        sale_structure: "phase_allocated",
        otc_enabled: true,
        otc_content:
          "<p>Contact <strong>sales@cireta.com</strong> for OTC purchases. Minimum 50 KG.</p>",
        website_url: "https://cireta.com",
        twitter_url: "https://twitter.com/cireta",
        telegram_url: "https://t.me/cireta",
        linkedin_url: "https://linkedin.com/company/cireta",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    saleId = body.id;
    expect(saleId).toBeTruthy();
    expect(body.is_coming_soon).toBe(true);
    expect(body.otc_enabled).toBe(true);
  });

  // ── Gallery: Images + Video ──

  test("3. Issuer adds 3 images to gallery (one as hero)", async ({
    request,
  }) => {
    const images = [
      {
        url: "https://storage.googleapis.com/cireta-public/demo/copper-mine-1.jpg",
        caption: "Aerial view of Mpwapwa mine site",
        is_banner: true,
        sort_order: 0,
        media_type: "image",
      },
      {
        url: "https://storage.googleapis.com/cireta-public/demo/copper-cathode.jpg",
        caption: "99.99% purity copper cathode samples",
        is_banner: false,
        sort_order: 1,
        media_type: "image",
      },
      {
        url: "https://storage.googleapis.com/cireta-public/demo/team-onsite.jpg",
        caption: "Team at Mpwapwa District",
        is_banner: false,
        sort_order: 2,
        media_type: "image",
      },
    ];

    for (const img of images) {
      const res = await request.post(`${API}/sales/${saleId}/images`, {
        headers: auth(issuerToken),
        data: img,
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.media_type).toBe("image");
    }
  });

  test("4. Issuer adds a video to gallery", async ({ request }) => {
    const res = await request.post(`${API}/sales/${saleId}/images`, {
      headers: auth(issuerToken),
      data: {
        url: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        caption: "Project overview video",
        is_banner: false,
        sort_order: 3,
        media_type: "video",
        video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.media_type).toBe("video");
    expect(body.video_url).toContain("youtube");
  });

  test("5. Gallery has 4 items, one is hero", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/images`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(4);
    const hero = body.find((i: { is_banner: boolean }) => i.is_banner);
    expect(hero).toBeTruthy();
    expect(hero.caption).toContain("Aerial");
    const video = body.find(
      (i: { media_type: string }) => i.media_type === "video"
    );
    expect(video).toBeTruthy();
    expect(video.video_url).toContain("youtube");
  });

  // ── Team Members ──

  test("6. Issuer adds team members", async ({ request }) => {
    const members = [
      {
        name: "Ahmad Al-Rashid",
        title: "CEO & Co-Founder",
        bio: "20+ years in mining and commodities. Former VP at Rio Tinto.",
        photo_url:
          "https://storage.googleapis.com/cireta-public/demo/team-ahmad.jpg",
      },
      {
        name: "Dr. Sarah Chen",
        title: "Chief Geologist",
        bio: "PhD Geology, Stanford. Led NI43-101 assessments across East Africa.",
      },
      {
        name: "James Mwangi",
        title: "Head of Operations, Tanzania",
        bio: "Local operations lead. 15 years in Tanzanian mining sector.",
      },
    ];

    for (const m of members) {
      const res = await request.post(`${API}/sales/${saleId}/team`, {
        headers: auth(issuerToken),
        data: m,
      });
      expect(res.status()).toBe(201);
    }
  });

  test("7. Team has 3 members", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/team`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(3);
    expect(body[0].name).toBe("Ahmad Al-Rashid");
  });

  // ── FAQs ──

  test("8. Issuer adds FAQs", async ({ request }) => {
    const faqs = [
      {
        question: "What is KCU?",
        answer:
          "KCU (Kinusi Copper Unit) represents 1 kg of verified copper cathode at 99.97%–99.99% purity.",
      },
      {
        question: "How is pricing determined?",
        answer:
          "Token price is set at $5 FOB Tanzania per KCU, representing up to 45% below current LME spot price.",
      },
      {
        question: "What is the delivery timeline?",
        answer:
          "After the 12-month vesting period, investors may redeem for physical delivery to a secured Dubai warehouse.",
      },
      {
        question: "Is the project insured?",
        answer:
          "Yes — Mayfair Insurance, Allianz Ghana, SIC Ghana, backed by SwissRe, Munich Re, and Lloyd's.",
      },
    ];

    for (const f of faqs) {
      const res = await request.post(`${API}/sales/${saleId}/faqs`, {
        headers: auth(issuerToken),
        data: f,
      });
      expect(res.status()).toBe(201);
    }
  });

  test("9. FAQs has 4 entries", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/faqs`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(4);
  });

  // ── Documents ──

  test("10. Issuer adds documents", async ({ request }) => {
    const docs = [
      {
        name: "Investor Prospectus",
        doc_type: "legal",
        url: "https://storage.googleapis.com/cireta-public/demo/prospectus.pdf",
      },
      {
        name: "NI43-101 Geological Report",
        doc_type: "audit",
        url: "https://storage.googleapis.com/cireta-public/demo/ni43-101.pdf",
      },
    ];

    for (const d of docs) {
      const res = await request.post(`${API}/sales/${saleId}/documents`, {
        headers: auth(issuerToken),
        data: d,
      });
      expect(res.status()).toBe(201);
    }
  });

  test("11. Documents has 2 entries", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/documents`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(2);
  });

  // ── Submit & Approve ──

  test("12. Issuer submits sale for approval", async ({ request }) => {
    const res = await request.post(
      `${API}/sales/${saleId}/submit-for-approval`,
      { headers: auth(issuerToken) }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending_approval");
  });

  test("13. Admin approves → APPROVED_COMING_SOON", async ({ request }) => {
    const res = await request.post(`${API}/admin/sales/${saleId}/approve`, {
      headers: auth(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved_coming_soon");
  });

  // ── Public Verification ──

  test("14. Public can view the sale with all content", async ({
    request,
  }) => {
    const res = await request.get(`${API}/sales/${saleId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Copper Cathode from Tanzania");
    expect(body.is_coming_soon).toBe(true);
    expect(body.otc_enabled).toBe(true);
    expect(body.status).toBe("approved_coming_soon");
  });

  test("15. Public can view gallery with video", async ({ request }) => {
    const res = await request.get(`${API}/sales/${saleId}/images`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(4);
    const video = body.find(
      (i: { media_type: string }) => i.media_type === "video"
    );
    expect(video.video_url).toBeTruthy();
  });

  test("16. Public can view team, FAQs, documents", async ({ request }) => {
    const [teamRes, faqRes, docRes] = await Promise.all([
      request.get(`${API}/sales/${saleId}/team`),
      request.get(`${API}/sales/${saleId}/faqs`),
      request.get(`${API}/sales/${saleId}/documents`),
    ]);
    expect(teamRes.status()).toBe(200);
    expect(faqRes.status()).toBe(200);
    expect(docRes.status()).toBe(200);

    expect((await teamRes.json()).length).toBe(3);
    expect((await faqRes.json()).length).toBe(4);
    expect((await docRes.json()).length).toBe(2);
  });

  test("17. Sale appears in public listing", async ({ request }) => {
    const res = await request.get(`${API}/sales/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const found = body.items.find((s: { id: string }) => s.id === saleId);
    expect(found).toBeTruthy();
    expect(found.title).toBe("Copper Cathode from Tanzania");
  });
});
