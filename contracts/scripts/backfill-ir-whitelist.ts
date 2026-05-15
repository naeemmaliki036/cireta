/**
 * Backfill wallet → identity-registry whitelist for any user that's
 * KYC-approved but whose wallet still shows registered_on_chain=false.
 *
 * Two-phase:
 *   1. Read on-chain isVerified(addr). If true, just print "DB stale" and
 *      skip — we'll patch the DB in a follow-up SQL.
 *   2. If false, fire addToWhitelist(addr, countryNumeric) from the admin
 *      signer (REGISTRAR_ROLE holder).
 *
 * Targets are passed inline below — edit the WALLETS list for ad-hoc runs.
 *
 * Run:
 *   ./node_modules/.bin/hardhat run scripts/backfill-ir-whitelist.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const IDENTITY_REGISTRY = "0x5B344d1E07B57D36B8FD99b2e241dd7E8674d7BE";

// ISO 3166-1 alpha-2 → numeric, minimal map for known sandbox users
const COUNTRY = {
  AL: 8,
  PK: 586,
  AE: 784,
  US: 840,
  GB: 826,
  IN: 356,
} as const;

const WALLETS: Array<{ email: string; addr: string; country: keyof typeof COUNTRY }> = [
  { email: "naeem+101@vanarchain.com", addr: "0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba", country: "AL" },
  { email: "naeem+102@vanarchain.com", addr: "0xF9782d0aabC1E5731D13a7cfC728A3785DD6444E", country: "PK" },
  { email: "naeem+103@vanarchain.com", addr: "0xa8854831bdc28573dfceFABCaF5d46F193534aF5", country: "PK" },
  { email: "naeem+i05@vanarchain.com", addr: "0xCf8d44D79Ca51E905E1c686E3804aeDFE3f908B3", country: "PK" },
];

async function main() {
  const sandboxEnv = fs.readFileSync(
    path.join(__dirname, "..", "..", ".env.sandbox-e2e"),
    "utf-8",
  );
  const getKey = (n: string) =>
    "0x" +
    sandboxEnv
      .match(new RegExp(`^${n}=([0-9a-fA-Fx]+)`, "m"))![1]
      .replace(/^0x/, "");
  const admin = new ethers.Wallet(getKey("ADMIN_PRIVATE_KEY"), ethers.provider);
  console.log("admin signer:", admin.address);

  const ir = await ethers.getContractAt(
    "SimpleIdentityRegistry",
    IDENTITY_REGISTRY,
    admin,
  );

  type Outcome = { email: string; addr: string; alreadyVerified: boolean; tx?: string; error?: string };
  const results: Outcome[] = [];

  for (const w of WALLETS) {
    const verified = await (ir as any).isVerified(w.addr);
    if (verified) {
      console.log(`✓ ${w.email}  on-chain already verified — DB stale, will sync`);
      results.push({ email: w.email, addr: w.addr, alreadyVerified: true });
      continue;
    }
    const country = COUNTRY[w.country];
    if (!country) {
      console.error(`✗ ${w.email}  unknown country code ${w.country}`);
      results.push({ email: w.email, addr: w.addr, alreadyVerified: false, error: `unknown country ${w.country}` });
      continue;
    }
    try {
      console.log(`→ ${w.email}  addToWhitelist(${w.addr}, ${country})`);
      const tx = await (ir as any).addToWhitelist(w.addr, country);
      const rcpt = await tx.wait();
      console.log(`  tx: ${rcpt.hash}`);
      results.push({ email: w.email, addr: w.addr, alreadyVerified: false, tx: rcpt.hash });
    } catch (e: any) {
      const msg = e?.shortMessage || e?.reason || e?.message || "unknown";
      console.error(`  failed: ${msg}`);
      results.push({ email: w.email, addr: w.addr, alreadyVerified: false, error: msg });
    }
  }

  console.log("\n══════ SUMMARY ══════");
  for (const r of results) {
    if (r.alreadyVerified) {
      console.log(`  ${r.email}  → already on-chain  (sync DB only)`);
    } else if (r.tx) {
      console.log(`  ${r.email}  → registered  tx=${r.tx}`);
    } else {
      console.log(`  ${r.email}  → FAILED  ${r.error}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
